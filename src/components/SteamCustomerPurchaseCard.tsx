import { useState, useEffect, useRef, useCallback } from "react";
import {
  Drop,
  Coins,
  Timer,
  UploadSimple,
  CheckCircle,
  Hourglass,
  Trash,
  ArrowClockwise,
  Sparkle,
  XCircle,
  Info,
} from "@phosphor-icons/react";
import { formatETB } from "../context/GymContext";
import {
  fetchSteamCatalog,
  fetchCustomerPendingSteamPayment,
  submitSteamPaymentProof,
  validateProofFile,
  type SteamCatalogItem,
  type CustomerPendingSteamPayment,
} from "../services/steamPurchaseService";
import { toast } from "sonner";

const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-6";

type PaymentMethod = "cash" | "cbe_birr" | "telebirr";

const PAYMENT_METHODS: { id: PaymentMethod; label: string; requiresProof: boolean }[] = [
  { id: "cash", label: "Cash", requiresProof: false },
  { id: "cbe_birr", label: "CBE", requiresProof: true },
  { id: "telebirr", label: "Telebirr", requiresProof: true },
];

interface SteamCustomerPurchaseCardProps {
  customerId: string;
  customerCode?: string;
  customerName?: string;
  hasActivePass?: boolean;
  activePassRemainingVisits?: number;
  onPurchaseSubmitted?: () => void;
}

export default function SteamCustomerPurchaseCard({
  customerId,
  customerCode = "—",
  customerName = "Customer",
  hasActivePass = false,
  activePassRemainingVisits = 0,
  onPurchaseSubmitted,
}: SteamCustomerPurchaseCardProps) {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [catalog, setCatalog] = useState<SteamCatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>("cbe_birr");
  const [showReceptionModal, setShowReceptionModal] = useState(false);

  // File upload state
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Pending payment state
  const [pendingPayment, setPendingPayment] = useState<CustomerPendingSteamPayment | null>(null);
  const [loadingPending, setLoadingPending] = useState(true);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProduct = catalog.find(p => p.id === selectedProductId) ?? catalog[0];

  // Load existing pending Steam payment for this customer
  const checkPendingPayment = useCallback(async () => {
    setLoadingPending(true);
    const res = await fetchCustomerPendingSteamPayment(customerId);
    setPendingPayment(res.data);
    setLoadingPending(false);
  }, [customerId]);

  useEffect(() => {
    checkPendingPayment();
  }, [checkPendingPayment]);

  useEffect(() => {
    let active = true;
    void fetchSteamCatalog().then(items => {
      if (!active) return;
      setCatalog(items);
      setSelectedProductId(current => items.some(item => item.id === current) ? current : items[0]?.id ?? "");
    }).catch(cause => {
      if (active) setSubmitError(cause instanceof Error ? cause.message : "Unable to load Steam services.");
    }).finally(() => { if (active) setLoadingCatalog(false); });
    return () => { active = false; };
  }, []);

  // Clean up Object URL on unmount or file change
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

    if (!file) return;

    const validation = validateProofFile(file);
    if (!validation.valid) {
      if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
      setProofFile(null);
      setProofPreviewUrl(null);
      setProofError(validation.error || "Invalid file format.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
    setProofError(null);
    setProofFile(file);
    setProofPreviewUrl(URL.createObjectURL(file));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveFile = () => {
    if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
    setProofFile(null);
    setProofPreviewUrl(null);
    setProofError(null);
    setSubmitError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmitProof = async () => {
    if (method === "cash") {
      setShowReceptionModal(true);
      return;
    }

    if (!selectedProduct) {
      setSubmitError("No active Steam service is available at this time.");
      return;
    }

    if (!proofFile) {
      setProofError("Please select a screenshot of your payment transfer.");
      return;
    }

    const validation = validateProofFile(proofFile);
    if (!validation.valid) {
      setProofError(validation.error || "Invalid file selected.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const result = await submitSteamPaymentProof({
      customerId,
      serviceId: selectedProduct.id,
      productType: selectedProduct.type,
      paymentMethod: method,
      file: proofFile,
    });

    setIsSubmitting(false);

    if (!result.success) {
      setSubmitError(result.error || "Failed to submit payment proof. Please try again.");
      toast.error(result.error || "Payment submission failed.");
      return;
    }

    toast.success("Payment proof submitted! Awaiting reception verification.");
    handleRemoveFile();
    await checkPendingPayment();
    if (onPurchaseSubmitted) {
      onPurchaseSubmitted();
    }
  };

  // 1. Loading pending state spinner
  if (loadingPending || loadingCatalog) {
    return (
      <div className={`${CARD} py-8 text-center text-zinc-400`}>
        <div className="inline-block animate-spin w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full mb-2" />
        <p className="text-xs">Checking Steam purchase status...</p>
      </div>
    );
  }

  // 2. Existing Pending Payment ("Payment Under Review")
  if (pendingPayment) {
    return (
      <div className={`${CARD} space-y-4 border-amber-500/40 bg-zinc-900/95 relative overflow-hidden`}>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
            <Hourglass weight="fill" className="w-6 h-6 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Payment Under Review
              </h3>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                PENDING VERIFICATION
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Your Steam payment receipt has been uploaded and is waiting for reception verification.
            </p>
          </div>
        </div>

        <div className="bg-zinc-800/60 rounded-xl p-4 space-y-2.5 text-xs border border-zinc-700/60">
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Selected Product</span>
            <span className="font-semibold text-white">{pendingPayment.productName} ({pendingPayment.visits ? `${pendingPayment.visits} sessions` : "usage as configured"})</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Amount</span>
            <span className="font-black text-cyan-400 text-sm">{formatETB(pendingPayment.amount)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Payment Method</span>
            <span className="font-semibold text-white">
              {pendingPayment.paymentMethod === "CBE_BIRR" ? "CBE" : pendingPayment.paymentMethod === "TELEBIRR" ? "Telebirr" : pendingPayment.paymentMethod}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Submitted At</span>
            <span className="font-mono text-zinc-300">
              {new Date(pendingPayment.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {new Date(pendingPayment.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>

        <div className="bg-cyan-950/20 border border-cyan-800/30 rounded-xl p-3 text-xs text-cyan-200/90 flex items-start gap-2.5">
          <Info weight="fill" className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Once staff verifies your transaction at reception, your Steam visits will be activated automatically. You do not need to submit another receipt.
          </p>
        </div>

        <button
          onClick={checkPendingPayment}
          className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2.5 rounded-xl transition text-xs flex items-center justify-center gap-2"
        >
          <ArrowClockwise className="w-4 h-4" />
          Check Verification Status
        </button>
      </div>
    );
  }

  if (catalog.length === 0) {
    return <div className={`${CARD} text-center`}><p className="font-semibold text-white">No Steam services are currently available.</p><p className="mt-2 text-sm text-zinc-400">Please ask reception for assistance.</p>{submitError && <p className="mt-2 text-xs text-red-300">{submitError}</p>}</div>;
  }

  // 3. Interactive Customer Purchase Flow
  return (
    <div className={`${CARD} space-y-5`}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg text-white flex items-center gap-2">
          <Drop weight="fill" className="w-5 h-5 text-cyan-400" /> Purchase Steam Access
        </h3>
        <span className="text-xs text-zinc-400 font-medium">Self-Service Portal</span>
      </div>

      {/* Active Pass Notice if user already has unspent visits */}
      {hasActivePass && activePassRemainingVisits > 0 && (
        <div className="bg-cyan-950/20 border border-cyan-800/40 rounded-xl p-3 text-xs text-cyan-300 flex items-center gap-2">
          <Info weight="fill" className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            You currently have <strong>{activePassRemainingVisits}</strong> active Steam session(s). Purchasing another pass will queue your sessions.
          </span>
        </div>
      )}

      {/* Product Selection Cards */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
          1. Select Product
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {catalog.map(item => {
            const isSelected = item.id === selectedProductId;
            const isPackage = item.type === "package";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedProductId(item.id);
                  setSubmitError(null);
                }}
                className={`text-left p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 relative ${
                  isSelected
                    ? "border-cyan-400 bg-cyan-950/25 ring-1 ring-cyan-400/50"
                    : "border-zinc-800 bg-zinc-800/40 hover:border-zinc-700 hover:bg-zinc-800/60"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 text-cyan-400">
                    <CheckCircle weight="fill" className="w-4 h-4" />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected ? "bg-cyan-400/20 text-cyan-400" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {isPackage ? <Coins weight="fill" className="w-5 h-5" /> : <Timer weight="fill" className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-white">{item.name}</div>
                    <div className="text-xs text-zinc-400">{item.validityLabel}</div>
                  </div>
                </div>

                <div className="border-t border-zinc-800/70 pt-2 flex items-baseline justify-between">
                  <div className="text-xs font-medium text-zinc-400">
                    {item.visits === 0 ? "Usage as configured" : `${item.visits} ${item.visits === 1 ? "session" : "sessions"}`}
                  </div>
                  <div className="text-base font-black text-cyan-400">
                    {formatETB(item.price)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Payment Method Selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
          2. Payment Method
        </label>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMethod(m.id);
                setSubmitError(null);
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-colors ${
                method === m.id
                  ? "bg-cyan-400 text-zinc-950"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cash Section Instructions */}
      {method === "cash" && (
        <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <Sparkle weight="fill" className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Pay with Cash at reception. No receipt upload required.</span>
          </div>
          <button
            type="button"
            onClick={() => setShowReceptionModal(true)}
            className="w-full bg-cyan-400 hover:bg-cyan-300 text-zinc-950 font-bold py-3 rounded-xl transition text-xs flex items-center justify-center gap-2"
          >
            View Reception Payment Instructions ({formatETB(selectedProduct?.price ?? 0)})
          </button>
        </div>
      )}

      {/* Digital Transfer Proof Upload Section (CBE / Telebirr) */}
      {(method === "cbe_birr" || method === "telebirr") && (
        <div className="space-y-4 pt-1">
          {/* Transfer Account Guidance */}
          <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-xl p-3.5 text-xs space-y-1.5">
            <div className="font-bold text-white flex items-center justify-between">
              <span>{method === "cbe_birr" ? "Commercial Bank of Ethiopia (CBE)" : "Telebirr"}</span>
              <span className="text-cyan-400 font-bold">{formatETB(selectedProduct?.price ?? 0)}</span>
            </div>
            {method === "cbe_birr" ? (
              <div className="text-zinc-400 space-y-0.5 text-[11px]">
                <div>Account Name: <strong className="text-zinc-200">Power Plus Gym</strong></div>
                <div>Account Number: <strong className="text-cyan-400 font-mono">1000234567891</strong></div>
              </div>
            ) : (
              <div className="text-zinc-400 space-y-0.5 text-[11px]">
                <div>Merchant / Phone: <strong className="text-cyan-400 font-mono">0911223344</strong></div>
                <div>Account Name: <strong className="text-zinc-200">Power Plus Gym</strong></div>
              </div>
            )}
            <p className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-800">
              Please transfer exactly {formatETB(selectedProduct?.price ?? 0)} and attach your payment confirmation screenshot below.
            </p>
          </div>

          {/* File Picker / Preview */}
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">
              3. Upload Payment Receipt
            </label>

            {!proofFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 hover:border-cyan-400/50 rounded-xl p-6 text-center cursor-pointer transition-colors bg-zinc-800/20 hover:bg-zinc-800/40"
              >
                <UploadSimple weight="bold" className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-white">Click to upload transfer screenshot</p>
                <p className="text-[11px] text-zinc-500 mt-1">JPG, PNG, or WebP up to 5 MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {proofPreviewUrl && (
                    <img
                      src={proofPreviewUrl}
                      alt="Receipt preview"
                      className="w-12 h-12 rounded-lg object-cover border border-zinc-700 shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{proofFile.name}</p>
                    <p className="text-[10px] text-zinc-400">
                      {(proofFile.size / 1024).toFixed(0)} KB · Ready to submit
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="p-2 text-zinc-400 hover:text-red-400 transition shrink-0"
                  title="Remove file"
                >
                  <Trash weight="bold" className="w-4 h-4" />
                </button>
              </div>
            )}

            {proofError && (
              <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
                <XCircle weight="fill" className="w-3.5 h-3.5 shrink-0" />
                {proofError}
              </p>
            )}
          </div>

          {submitError && (
            <div className="p-3 bg-red-400/10 border border-red-400/20 rounded-xl text-xs text-red-400 flex items-start gap-2">
              <XCircle weight="fill" className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleSubmitProof}
            disabled={!proofFile || isSubmitting}
            className="w-full bg-cyan-400 hover:bg-cyan-300 text-zinc-950 font-bold py-3.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-md"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
                Submitting Payment Proof...
              </>
            ) : (
              <>
                <UploadSimple weight="bold" className="w-4 h-4" />
                Submit Payment Proof ({formatETB(selectedProduct?.price ?? 0)})
              </>
            )}
          </button>
        </div>
      )}

      {/* Cash Reception Instructions Modal */}
      {showReceptionModal && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cyan-400/15 border border-cyan-400/30 flex items-center justify-center shrink-0">
                <Drop weight="fill" className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h4 className="font-bold text-white text-base">Reception Cash Payment</h4>
                <p className="text-xs text-zinc-400">Steam access voucher details</p>
              </div>
            </div>

            <div className="bg-zinc-800/60 rounded-xl p-4 space-y-2 text-xs border border-zinc-700/60">
              <div className="flex justify-between">
                <span className="text-zinc-400">Member</span>
                <span className="font-bold text-white">{customerName} ({customerCode})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Steam Product</span>
                <span className="font-semibold text-cyan-400">{selectedProduct?.name} ({selectedProduct?.visits === 0 ? "usage as configured" : `${selectedProduct?.visits} sessions`})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Amount Due</span>
                <span className="font-black text-white text-sm">{formatETB(selectedProduct?.price ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Method</span>
                <span className="font-semibold text-white">Cash</span>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Please present your Member Code <strong>{customerCode}</strong> to the reception desk. Once staff receive your cash payment, your Steam access will be activated immediately on your account.
            </p>

            <button
              type="button"
              onClick={() => setShowReceptionModal(false)}
              className="w-full bg-cyan-400 text-zinc-950 font-bold py-2.5 rounded-xl hover:bg-cyan-300 transition-colors text-xs"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
