import { useState, useEffect, useCallback, useRef } from "react";
import {
  CreditCard,
  Clock,
  Calendar,
  CheckCircle,
  Warning,
  Info,
  ArrowClockwise,
  XCircle,
  User,
  Sparkle,
  UploadSimple,
  Trash,
  Image as ImageIcon,
  Hourglass,
  ArrowRight,
} from "@phosphor-icons/react";
import {
  fetchRegularRenewalData,
  submitRegularRenewalProof,
  validateProofFile,
  MAX_FILE_SIZE_BYTES,
  type RegularRenewalState,
  type RegularRenewalPlan,
} from "../services/regularRenewalService";
import { formatETB } from "../context/GymContext";

const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-6";
const INPUT = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50";

type PaymentMethod = "cash" | "cbe_birr" | "telebirr";

const PAYMENT_METHODS: { id: PaymentMethod; label: string; requiresProof: boolean }[] = [
  { id: "cash", label: "Cash", requiresProof: false },
  { id: "cbe_birr", label: "CBE", requiresProof: true },
  { id: "telebirr", label: "Telebirr", requiresProof: true },
];

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash (Reception)",
  cbe_birr: "CBE",
  telebirr: "Telebirr",
};

interface RegularRenewViewProps {
  customerId: string;
  category?: "REGULAR" | "STUDENT";
  onRenewalSubmitted?: () => void;
}

interface SubmittedProofInfo {
  paymentId?: string;
  planName: string;
  amount: number;
  method: "cbe_birr" | "telebirr";
  fileName: string;
}

export default function RegularRenewView({ customerId, category = "REGULAR", onRenewalSubmitted }: RegularRenewViewProps) {
  const [state, setState] = useState<RegularRenewalState>({ status: "loading" });
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("cbe_birr");
  const [showReceptionModal, setShowReceptionModal] = useState(false);

  // Payment proof screenshot states
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedProof, setSubmittedProof] = useState<SubmittedProofInfo | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const renewalRequestKey = useRef<string | null>(null);

  useEffect(() => { renewalRequestKey.current = null; }, [selectedPlanId, method, category]);

  const loadData = useCallback(() => {
    setState({ status: "loading" });
    fetchRegularRenewalData(customerId, category)
      .then(res => {
        setState(res);
        if (res.status === "success" && res.data.availablePlans.length > 0) {
          const currentPlanId = res.data.currentMembership?.plan?.id;
          const match = res.data.availablePlans.find(p => p.id === currentPlanId);
          setSelectedPlanId(match ? match.id : res.data.availablePlans[0].id);
        }
      })
      .catch(err => {
        console.error("[RegularRenewView] Error loading renewal data:", err);
        setState({
          status: "error",
          error: "Failed to connect to the database. Please check your internet connection.",
        });
      });
  }, [customerId, category]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Clean up object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (proofPreviewUrl) {
        URL.revokeObjectURL(proofPreviewUrl);
      }
    };
  }, [proofPreviewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setSubmitError(null);

    if (!file) {
      return;
    }

    const validation = validateProofFile(file);
    if (!validation.valid) {
      if (proofPreviewUrl) {
        URL.revokeObjectURL(proofPreviewUrl);
      }
      setProofFile(null);
      setProofPreviewUrl(null);
      setProofError(validation.error || "Invalid file.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Valid file
    if (proofPreviewUrl) {
      URL.revokeObjectURL(proofPreviewUrl);
    }
    setProofError(null);
    setProofFile(file);
    setProofPreviewUrl(URL.createObjectURL(file));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveFile = () => {
    if (proofPreviewUrl) {
      URL.revokeObjectURL(proofPreviewUrl);
    }
    setProofFile(null);
    setProofPreviewUrl(null);
    setProofError(null);
    setSubmitError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleProofSubmit = async () => {
    if (state.status !== "success") return;
    const { currentMembership, availablePlans } = state.data;
    const selectedPlan = availablePlans.find(p => p.id === selectedPlanId) || availablePlans[0];

    if (!selectedPlan) {
      setSubmitError("Please select a renewal plan first.");
      return;
    }

    if (method === "cash") {
      setShowReceptionModal(true);
      return;
    }

    if (!proofFile) {
      setProofError("Payment screenshot is required before submitting your renewal request.");
      return;
    }

    const validation = validateProofFile(proofFile);
    if (!validation.valid) {
      setProofError(validation.error || "Invalid file selected.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const result = await submitRegularRenewalProof({
      customerId,
      category,
      idempotencyKey: category === "STUDENT" ? (renewalRequestKey.current ??= crypto.randomUUID()) : undefined,
      membershipId: currentMembership?.id || null,
      plan: selectedPlan,
      paymentMethod: method,
      file: proofFile,
    });

    setIsSubmitting(false);

    if (!result.success) {
      setSubmitError(result.error || "Failed to submit payment proof. Please try again.");
      return;
    }
    renewalRequestKey.current = null;

    // Success! Show confirmation card
    setSubmittedProof({
      paymentId: result.paymentId,
      planName: selectedPlan.name,
      amount: selectedPlan.price,
      method,
      fileName: proofFile.name,
    });
    onRenewalSubmitted?.();
    handleRemoveFile();
  };

  // 1. Loading State
  if (state.status === "loading") {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="w-10 h-10 border-4 border-lime-400/20 border-t-lime-400 rounded-full animate-spin mx-auto mb-4" />
        <h3 className="text-base font-bold text-white">Loading Membership and Plans...</h3>
        <p className="text-xs text-zinc-500 mt-1">Retrieving membership and plan rates from Supabase</p>
      </div>
    );
  }

  // 2. Error State
  if (state.status === "error") {
    return (
      <div className="max-w-lg mx-auto">
        <div className={`${CARD} text-center space-y-4`}>
          <div className="w-12 h-12 rounded-full bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto">
            <XCircle weight="fill" className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="text-lg font-bold text-white">Unable to Load Renewal Information</h3>
          <p className="text-sm text-zinc-400">{state.error}</p>
          <button
            onClick={loadData}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors inline-flex items-center gap-2 mx-auto"
          >
            <ArrowClockwise weight="bold" className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // 3. Customer Not Found State
  if (state.status === "not_found") {
    return (
      <div className="max-w-lg mx-auto">
        <div className={`${CARD} text-center space-y-3`}>
          <User className="w-12 h-12 text-zinc-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">Customer Not Found</h3>
          <p className="text-sm text-zinc-500">{state.message}</p>
        </div>
      </div>
    );
  }

  // 4. Success State
  const { customer, currentMembership, availablePlans } = state.data;
  const selectedPlan: RegularRenewalPlan | undefined = availablePlans.find(
    p => p.id === selectedPlanId
  ) || availablePlans[0];

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Current Membership Status Banner */}
      <div className={`${CARD} border-zinc-800 relative overflow-hidden`}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider">
              Current Membership · {customer.customerCode}
            </div>
            <div className="text-lg font-black text-white mt-0.5">
              {currentMembership?.plan?.name || "No Active Plan"}
            </div>
          </div>
          {currentMembership ? (
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                currentMembership.isExpired
                  ? "bg-red-400/20 text-red-400 border border-red-400/30"
                  : currentMembership.daysRemaining <= 7
                  ? "bg-yellow-400/20 text-yellow-400 border border-yellow-400/30"
                  : "bg-lime-400/20 text-lime-400 border border-lime-400/30"
              }`}
            >
              {currentMembership.status}
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-zinc-800 text-zinc-400 border border-zinc-700">
              Not Enrolled
            </span>
          )}
        </div>

        {currentMembership ? (
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-800/80 text-xs text-zinc-400">
            <div>
              <span className="text-zinc-500 block">Valid Until</span>
              <span className="font-semibold text-white">{currentMembership.endDate}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Status</span>
              <span className="font-semibold text-lime-400">
                {currentMembership.isExpired
                  ? "Expired"
                  : `${currentMembership.daysRemaining} days remaining`}
              </span>
            </div>
          </div>
        ) : (
          <div className="pt-2 text-xs text-zinc-400">
            No active membership record found in Supabase. Select a plan below to renew.
          </div>
        )}
      </div>

      {/* Submitted Proof Confirmation Banner (if pending request was submitted) */}
      {submittedProof && (
        <div className="bg-lime-400/10 border border-lime-400/30 rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-lime-400/20 border border-lime-400/40 flex items-center justify-center shrink-0">
              <Hourglass weight="fill" className="w-5 h-5 text-lime-400 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide bg-lime-400/20 text-lime-300 border border-lime-400/30">
                  Verification Pending
                </span>
                <span className="text-xs text-zinc-500">
                  {METHOD_LABELS[submittedProof.method]}
                </span>
              </div>
              <h4 className="text-base font-bold text-white">Payment Proof Submitted</h4>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Payment proof submitted. Your payment screenshot will be reviewed by PowerPlus Gym reception before your renewal is confirmed.
              </p>
            </div>
          </div>

          <div className="bg-zinc-900/80 rounded-xl p-3.5 space-y-2 text-xs border border-zinc-800">
            <div className="flex justify-between">
              <span className="text-zinc-400">Requested Plan</span>
              <span className="font-semibold text-white">{submittedProof.planName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Amount Due</span>
              <span className="font-black text-lime-400">{formatETB(submittedProof.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Payment Status</span>
              <span className="font-semibold text-amber-300">PENDING (Not Paid Yet)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Uploaded File</span>
              <span className="text-zinc-400 truncate max-w-[180px]">{submittedProof.fileName}</span>
            </div>
          </div>

          <div className="p-3 bg-amber-400/10 border border-amber-400/20 rounded-xl text-xs text-amber-200 flex items-start gap-2">
            <Info weight="fill" className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Your membership dates have not been modified yet. PowerPlus Gym reception staff will verify the transaction on CBE / Telebirr records before activating your renewal.
            </span>
          </div>

          <button
            type="button"
            onClick={() => setSubmittedProof(null)}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs py-2.5 rounded-xl transition-colors"
          >
            Submit Another Request
          </button>
        </div>
      )}

      {/* Renewal Form */}
      <div className={`${CARD} space-y-5`}>
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-5 h-5 text-lime-400" />
          <h3 className="font-bold text-lg text-white">Renew Membership</h3>
        </div>
        <p className="text-xs text-zinc-400">
          Select your renewal plan and preferred payment method.
        </p>

        {/* Plan Selection */}
        <div>
          <label className="text-xs text-zinc-400 block mb-1.5 font-medium">Select Plan</label>
          {availablePlans.length === 0 ? (
            <p className="text-sm text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-xl p-3">
              No renewal plans currently active in database.
            </p>
          ) : (
            <select
              value={selectedPlanId}
              onChange={e => setSelectedPlanId(e.target.value)}
              className={INPUT}
            >
              {availablePlans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatETB(p.price)} ({p.durationDays} days)
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Payment Method Selector */}
        <div>
          <label className="text-xs text-zinc-400 block mb-2 font-medium">Payment Method</label>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMethod(m.id);
                  setSubmitError(null);
                }}
                className={`px-3 py-3 rounded-xl text-xs font-semibold transition-all text-center flex flex-col items-center justify-center gap-1 ${
                  method === m.id
                    ? "bg-lime-400 text-zinc-950 font-bold shadow-lg shadow-lime-400/10"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-750 border border-zinc-700/60"
                }`}
              >
                <span>{m.label}</span>
                {m.requiresProof ? (
                  <span className={`text-[10px] ${method === m.id ? "text-zinc-800" : "text-zinc-500"}`}>
                    Screenshot
                  </span>
                ) : (
                  <span className={`text-[10px] ${method === m.id ? "text-zinc-800" : "text-zinc-500"}`}>
                    At Reception
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Payment Proof Upload Section (Shown ONLY for CBE and Telebirr) */}
        {method !== "cash" && (
          <div className="space-y-3 pt-2 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-300 font-semibold flex items-center gap-1.5">
                <UploadSimple weight="bold" className="w-3.5 h-3.5 text-lime-400" />
                Upload Payment Screenshot <span className="text-red-400">*</span>
              </label>
              <span className="text-[10px] text-zinc-500">Max 5MB (JPG, PNG, WebP)</span>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
              id="regular-proof-upload-input"
            />

            {!proofFile ? (
              /* Dropzone / Upload trigger */
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                  proofError
                    ? "border-red-500/50 bg-red-500/5 hover:bg-red-500/10"
                    : "border-zinc-700 bg-zinc-800/30 hover:bg-zinc-800/60 hover:border-lime-400/40"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto mb-2 text-zinc-400">
                  <UploadSimple weight="bold" className="w-5 h-5 text-lime-400" />
                </div>
                <p className="text-xs font-semibold text-white">
                  Click to select payment screenshot
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Upload transfer receipt from your {method === "cbe_birr" ? "CBE" : "Telebirr"} app
                </p>
              </div>
            ) : (
              /* Selected Image Preview Card */
              <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-3 flex items-center gap-3">
                {proofPreviewUrl ? (
                  <img
                    src={proofPreviewUrl}
                    alt="Payment screenshot preview"
                    className="w-14 h-14 object-cover rounded-lg border border-zinc-750 shrink-0 bg-black"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-zinc-700 flex items-center justify-center shrink-0">
                    <ImageIcon className="w-6 h-6 text-zinc-400" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white truncate">
                    <CheckCircle weight="fill" className="w-3.5 h-3.5 text-lime-400 shrink-0" />
                    <span className="truncate">{proofFile.name}</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {(proofFile.size / 1024).toFixed(1)} KB · Ready to upload
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-lime-400 hover:text-lime-300 px-2 py-1 rounded bg-zinc-700/50 hover:bg-zinc-700 transition-colors"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    title="Remove image"
                    className="p-1.5 text-zinc-400 hover:text-red-400 rounded hover:bg-zinc-700/50 transition-colors"
                  >
                    <Trash weight="bold" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Validation or Error Message */}
            {proofError && (
              <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex items-start gap-2 text-xs text-red-300">
                <XCircle weight="fill" className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{proofError}</span>
              </div>
            )}

            {/* Safety Notice regarding Admin Review */}
            <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl p-3 flex items-start gap-2.5 text-xs text-zinc-300">
              <Info weight="fill" className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed text-[11px]">
                Your payment screenshot will be reviewed by PowerPlus Gym reception before your renewal is confirmed. Uploading does not immediately activate your membership.
              </div>
            </div>
          </div>
        )}

        {/* Real Summary Breakdown */}
        {selectedPlan && (
          <div className="bg-zinc-800/50 rounded-xl p-4 space-y-2 text-sm border border-zinc-700/50">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">Selected Plan</span>
              <span className="font-semibold text-white">{selectedPlan.name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">Duration</span>
              <span className="font-semibold text-white">{selectedPlan.durationDays} days</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">Payment Option</span>
              <span className="font-semibold text-white">{METHOD_LABELS[method]}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-700/80 pt-2">
              <span className="text-zinc-300 font-semibold text-sm">Total Due</span>
              <span className="font-black text-lime-400 text-lg">
                {formatETB(selectedPlan.price)}
              </span>
            </div>
          </div>
        )}

        {/* Submission Error Banner */}
        {submitError && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-red-300">
            <XCircle weight="fill" className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Dynamic Action Button according to payment method */}
        {method === "cash" ? (
          <button
            type="button"
            onClick={() => setShowReceptionModal(true)}
            disabled={!selectedPlan}
            className="w-full bg-lime-400 text-zinc-950 font-bold py-3.5 rounded-xl hover:bg-lime-300 transition-colors disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
          >
            <User weight="bold" className="w-4 h-4" />
            Continue at Reception ({selectedPlan ? formatETB(selectedPlan.price) : "—"})
          </button>
        ) : (
          <button
            type="button"
            onClick={handleProofSubmit}
            disabled={!selectedPlan || !proofFile || isSubmitting}
            className="w-full bg-lime-400 text-zinc-950 font-bold py-3.5 rounded-xl hover:bg-lime-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
                Submitting Payment Proof...
              </>
            ) : (
              <>
                <UploadSimple weight="bold" className="w-4 h-4" />
                Submit Payment Proof ({selectedPlan ? formatETB(selectedPlan.price) : "—"})
              </>
            )}
          </button>
        )}
      </div>

      {/* Reception Instructions Modal (for Cash) */}
      {showReceptionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-lime-400/10 border border-lime-400/20 flex items-center justify-center shrink-0">
                <Sparkle weight="fill" className="w-5 h-5 text-lime-400" />
              </div>
              <div>
                <h4 className="font-bold text-white text-base">Reception Payment Instructions</h4>
                <p className="text-xs text-zinc-400">Membership renewal voucher details</p>
              </div>
            </div>

            <div className="bg-zinc-800/60 rounded-xl p-4 space-y-2 text-xs border border-zinc-700/60">
              <div className="flex justify-between">
                <span className="text-zinc-400">Member</span>
                <span className="font-bold text-white">{customer.fullName} ({customer.customerCode})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Plan</span>
                <span className="font-semibold text-lime-400">{selectedPlan?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Amount Due</span>
                <span className="font-black text-white">{selectedPlan ? formatETB(selectedPlan.price) : ""}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Selected Method</span>
                <span className="font-semibold text-white">Cash</span>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Please present your Member Code <strong>{customer.customerCode}</strong> to the reception desk. Once staff receive your cash payment, your membership will be extended immediately in the database.
            </p>

            <button
              onClick={() => setShowReceptionModal(false)}
              className="w-full bg-lime-400 text-zinc-950 font-bold py-2.5 rounded-xl hover:bg-lime-300 transition-colors"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
