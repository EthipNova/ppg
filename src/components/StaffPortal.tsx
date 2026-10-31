import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, MagnifyingGlass, Lightning, CheckCircle, User, Plus, Clock, Warning, GraduationCap, MoonStars, MusicNotes, Sparkle, Prohibit, Lockers, Camera, X, Key, Copy, GenderMale, GenderFemale } from "@phosphor-icons/react";
import { useGym, useT, formatETB, addAudit, planAppliesToCategory, categoryLabelOf } from "../context/GymContext";
import type { CustomerCategory, Member } from "../types";
import { toast } from "sonner";
import { ALL_CATEGORIES } from "../constants";
import LockersManagement from "./LockersManagement";
import SteamManagement from "./SteamManagement";
import { searchCustomersForCheckIn, recordAttendanceCheckIn, fetchTodayAttendance, type CheckInCustomer, type AttendanceRecordItem } from "../services/checkInService";
import { registerMemberByReception } from "../services/memberRegistrationService";
import { fetchMonthlyTrainerFee, fetchActiveTrainers, type ActiveTrainer } from "../services/personalTrainerService";
import { ChalkboardTeacher, Info } from "@phosphor-icons/react";

const CATEGORY_ICONS: Record<CustomerCategory, typeof Sparkle> = { REGULAR: Sparkle, STUDENT: GraduationCap, MUSLIM: MoonStars, AEROBICS: MusicNotes };
function CategoryBadge({ category }: { category: CustomerCategory }) {
  const { state } = useGym();
  const Icon = CATEGORY_ICONS[category];
  return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-300"><Icon weight="fill" className="w-3 h-3 text-lime-400" />{categoryLabelOf(state, category)}</span>;
}

const TABS = ["checkin", "lockers", "steam", "register"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  checkin: "staff.tab.checkin",
  lockers: "staff.tab.lockers",
  steam: "staff.tab.steam",
  register: "staff.tab.register",
};

export default function StaffPortal() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("checkin");

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <Users weight="fill" className="w-6 h-6 text-lime-400" />
          <h1 className="text-2xl font-black uppercase tracking-tight">{t("staff.title")}</h1>
        </div>
        <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
          {TABS.map(key => (
            <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${tab === key ? "bg-lime-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>{t(TAB_LABEL[key])}</button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {tab === "checkin" && <CheckInView />}
            {tab === "lockers" && <LockersManagement canManage />}
            {tab === "steam" && <SteamView />}
            {tab === "register" && <RegisterView />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function CheckInView() {
  const { state, dispatch } = useGym();
  const t = useT();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CustomerCategory | "ALL">("ALL");
  const [results, setResults] = useState<CheckInCustomer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecordItem[]>([]);
  const [lastCheckIn, setLastCheckIn] = useState<{ customer: CheckInCustomer; time: string } | null>(null);
  const [refused, setRefused] = useState<{ customer: CheckInCustomer; reason: string } | null>(null);
  const actor = state.currentUser?.name || "Reception";

  // Load today's actual attendance records from Supabase
  const loadTodayAttendance = useCallback(async () => {
    try {
      const records = await fetchTodayAttendance();
      setTodayAttendance(records);
    } catch (err) {
      console.error("Failed to load today's attendance:", err);
    }
  }, []);

  useEffect(() => {
    void loadTodayAttendance();
  }, [loadTodayAttendance]);

  // Search for customers in Supabase (debounced for input, immediate on category toggle)
  useEffect(() => {
    let active = true;
    const q = search.trim();

    setIsSearching(true);
    const delay = q ? 200 : 0;
    const timer = setTimeout(async () => {
      try {
        const data = await searchCustomersForCheckIn(q, categoryFilter);
        if (active) {
          setResults(data);
        }
      } catch (err) {
        if (active) {
          console.error("Check-in customer search failed:", err);
          toast.error("Unable to search customers from database.");
        }
      } finally {
        if (active) setIsSearching(false);
      }
    }, delay);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, categoryFilter]);

  // Execute check-in operation against Supabase attendance table
  const executeCheckIn = async (customer: CheckInCustomer, overrideReason?: string) => {
    try {
      const result = await recordAttendanceCheckIn(customer, actor, overrideReason);
      const timeStr = new Date(result.checkedInAt).toLocaleTimeString();
      setLastCheckIn({ customer, time: timeStr });
      setRefused(null);
      await loadTodayAttendance();

      // Refresh customer list to show updated attendance state
      const updatedList = await searchCustomersForCheckIn(search.trim(), categoryFilter);
      setResults(updatedList);

      // Audit and notify
      addAudit(
        dispatch,
        overrideReason ? "Check-in (override)" : "Check-in",
        actor,
        `${customer.fullName} (${customer.customerCode}) · ${categoryLabelOf(state, customer.category)}`
      );
      toast.success(t("staff.checkedIn", { name: customer.fullName }));
    } catch (cause) {
      console.error("Check-in recording failed:", cause);
      toast.error(cause instanceof Error ? cause.message : "Failed to record check-in.");
    }
  };

  const handleCheckInClick = (customer: CheckInCustomer) => {
    // 1. Student verification check
    if (customer.category === "STUDENT" && customer.studentVerified !== true) {
      const reason = "Student verification is pending; reception must approve student documents before gym access.";
      addAudit(dispatch, "Access denied", actor, `${customer.fullName} · ${reason}`);
      setRefused({ customer, reason });
      toast.error(reason);
      return;
    }

    // 2. Blocked customer status
    if (customer.status === "BLOCKED") {
      const reason = `Customer account is BLOCKED by management.`;
      addAudit(dispatch, "Access denied", actor, `${customer.fullName} · ${reason}`);
      setRefused({ customer, reason });
      toast.error(reason);
      return;
    }

    // 3. Expired or inactive membership validation
    const membership = customer.membership;
    if (!membership || membership.isExpired || customer.status === "INACTIVE") {
      const reason = !membership
        ? "No active membership plan on record in database."
        : membership.endDate
        ? `Membership expired on ${membership.endDate}.`
        : "Membership is currently inactive.";
      addAudit(dispatch, "Access denied", actor, `${customer.fullName} · ${reason}`);
      setRefused({ customer, reason });
      toast.error(`Membership Warning: ${reason}`);
      return;
    }

    // 4. Valid active customer
    void executeCheckIn(customer);
  };

  const renderStatusBadge = (customer: CheckInCustomer) => {
    if (customer.status === "BLOCKED") {
      return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-400/20 text-purple-400">Blocked</span>;
    }
    const mem = customer.membership;
    if (!mem || mem.isExpired || customer.status === "INACTIVE") {
      return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-400/20 text-red-400">Expired</span>;
    }
    if (mem.daysRemaining <= 5) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-400/20 text-yellow-400">Expiring ({mem.daysRemaining}d)</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-lime-400/20 text-lime-400">Active</span>;
  };

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <div className="relative">
        <MagnifyingGlass className="w-6 h-6 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t("staff.searchPlaceholder")}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-white text-lg placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50"
          autoFocus
        />
        {isSearching && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
            <Clock className="w-4 h-4 animate-spin text-lime-400" />
            <span>Searching Supabase...</span>
          </div>
        )}
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategoryFilter("ALL")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            categoryFilter === "ALL" ? "bg-lime-400 text-zinc-950 font-bold" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          }`}
        >
          {t("staff.allCategories")}
        </button>
        {state.categoryLabels.map(c => (
          <button
            key={c.category}
            onClick={() => setCategoryFilter(c.category)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              categoryFilter === c.category ? "bg-lime-400 text-zinc-950 font-bold" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Refused / Warning Prompt with Override Action */}
      {refused && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Prohibit weight="fill" className="w-8 h-8 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-red-400 text-base">
                {t("staff.accessDenied")} — {refused.customer.fullName} ({refused.customer.customerCode})
              </div>
              <div className="text-sm text-zinc-300 mt-0.5">{refused.reason}</div>
              <div className="text-xs text-zinc-400 mt-1">
                Plan: {refused.customer.membership?.planName || "None"} · Expiration: {refused.customer.membership?.endDate || "N/A"}
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                const note = window.prompt("Reason for receptionist override (required):", "Emergency entry permitted by reception");
                if (!note?.trim()) return;
                void executeCheckIn(refused.customer, note.trim());
              }}
              className="flex-1 bg-lime-400 text-zinc-950 font-bold text-sm py-2.5 rounded-xl hover:bg-lime-300 transition-colors"
            >
              {t("staff.allowOverride")}
            </button>
            <button
              onClick={() => setRefused(null)}
              className="flex-1 bg-zinc-800 text-zinc-200 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Last Successful Check-In Banner */}
      {lastCheckIn && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-lime-400/10 border border-lime-400/30 rounded-2xl p-4 flex items-center gap-4"
        >
          <CheckCircle weight="fill" className="w-8 h-8 text-lime-400 shrink-0" />
          <div>
            <div className="font-bold text-lime-400 text-base">
              {t("staff.checkedIn", { name: lastCheckIn.customer.fullName })}
            </div>
            <div className="text-sm text-zinc-400">
              {lastCheckIn.time} · Member ID: {lastCheckIn.customer.customerCode} · Category: {categoryLabelOf(state, lastCheckIn.customer.category)}
            </div>
          </div>
        </motion.div>
      )}

      {/* Member Results List */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold px-1">
            <span>
              {search
                ? `Search results for "${search}"`
                : categoryFilter === "ALL"
                ? "Registered Members"
                : `${categoryLabelOf(state, categoryFilter)} Members`}
            </span>
            <span className="bg-zinc-800 text-lime-400 px-2 py-0.5 rounded-full font-mono">
              {results.length} member{results.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="space-y-2">
            {results.map(c => {
              const isMemExpired = !c.membership || c.membership.isExpired;
              const isBlocked = c.status === "BLOCKED";
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-4">
                    <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center shrink-0">
                      <User className="w-6 h-6 text-zinc-400" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-base">{c.fullName}</span>
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-lime-400 font-semibold">
                          {c.customerCode}
                        </span>
                        {renderStatusBadge(c)}
                        <CategoryBadge category={c.category} />
                        {c.activeLockerNumber && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-400/15 text-amber-400 border border-amber-400/20">
                            <Lockers weight="fill" className="w-3 h-3" />
                            Locker {c.activeLockerNumber}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-3">
                        <span>Phone: {c.phone}</span>
                        <span>·</span>
                        <span>Plan: <strong className="text-zinc-200">{c.membership?.planName || "No Plan"}</strong></span>
                        {c.membership?.startDate && c.membership?.endDate && (
                          <>
                            <span>·</span>
                            <span className={isMemExpired ? "text-red-400 font-semibold" : "text-zinc-400"}>
                              Validity: {c.membership.startDate} to {c.membership.endDate}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      onClick={() => handleCheckInClick(c)}
                      className={`px-6 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.96] flex items-center gap-2 ${
                        isMemExpired || isBlocked
                          ? "bg-amber-400/20 text-amber-300 border border-amber-400/30 hover:bg-amber-400/30"
                          : "bg-lime-400 text-zinc-950 hover:bg-lime-300 shadow-md shadow-lime-400/10"
                      }`}
                    >
                      <Lightning weight="fill" className="w-4 h-4" />
                      <span>{isMemExpired || isBlocked ? "Check In (Warning)" : t("staff.checkIn")}</span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty States */}
      {!isSearching && results.length === 0 && (
        <div className="text-center py-12 text-zinc-500 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl">
          <Warning className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
          <p className="font-semibold text-white text-base">
            {search ? t("staff.noMembersFound") : "No members found in this category"}
          </p>
          <p className="text-sm mt-1">
            {search
              ? t("staff.noMembersHint")
              : "No customers match the selected filter. Try searching by name, phone, or Member ID."}
          </p>
        </div>
      )}

      {/* Today's Check-ins Section (Connected to Supabase attendance table) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base flex items-center gap-2 text-white">
            <Clock className="w-5 h-5 text-lime-400" />
            <span>{t("staff.todayCheckIns")}</span>
          </h3>
          <span className="text-xs text-zinc-500 font-semibold">
            {todayAttendance.length} recorded today
          </span>
        </div>

        <div className="space-y-2">
          {todayAttendance.slice(0, 15).map(att => (
            <div
              key={att.id}
              className="flex justify-between items-center text-sm py-2.5 border-b border-zinc-800/50 hover:bg-zinc-800/30 px-2 rounded-lg transition-colors"
            >
              <div className="font-medium flex items-center gap-2.5">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-lime-400 font-semibold">
                  {att.customerCode}
                </span>
                <span className="text-white">{att.customerName}</span>
                <CategoryBadge category={att.category} />
                {att.accessStatus === "override" && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400 font-bold">
                    {t("staff.override")}
                  </span>
                )}
              </div>
              <span className="text-zinc-500 text-xs font-mono">
                {new Date(att.checkedInAt).toLocaleTimeString()}
              </span>
            </div>
          ))}

          {todayAttendance.length === 0 && (
            <p className="text-sm text-zinc-500 py-4 text-center">{t("staff.noCheckIns")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function emptyForm() {
  return {
    name: "",
    phone: "",
    gender: "" as "Male" | "Female" | "",
    planId: "",
    category: "REGULAR" as CustomerCategory,
    studentId: "",
    institution: "",
    paymentMethod: "CASH",
    needsTrainer: false,
    trainerId: "",
  };
}

function RegisterView() {
  const { state, dispatch } = useGym();
  const t = useT();
  const [form, setForm] = useState(emptyForm());
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [trainers, setTrainers] = useState<ActiveTrainer[]>([]);
  const [trainerFee, setTrainerFee] = useState<number>(500);
  const [loadingTrainers, setLoadingTrainers] = useState<boolean>(true);
  const [trainerLoadError, setTrainerLoadError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    fullName: string;
    customerId: string;
    loginId: string;
    tempPassword?: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<"login" | "password" | null>(null);

  const actor = state.currentUser?.name || "Reception";
  const applicablePlans = state.plans.filter(p => p.active && planAppliesToCategory(p, form.category));
  const selectedPlan = state.plans.find(p => p.id === form.planId);
  const totalAmountDue = selectedPlan
    ? selectedPlan.price + (form.needsTrainer ? trainerFee : 0)
    : 0;

  // Load configured trainer fee and active trainers from Supabase
  useEffect(() => {
    let mounted = true;
    async function loadTrainerConfig() {
      try {
        setLoadingTrainers(true);
        setTrainerLoadError(null);
        const [fee, list] = await Promise.all([
          fetchMonthlyTrainerFee(),
          fetchActiveTrainers(),
        ]);
        if (mounted) {
          setTrainerFee(fee > 0 ? fee : 500);
          setTrainers(list);
        }
      } catch (err) {
        console.error("Failed to load trainer config:", err);
        if (mounted) {
          setTrainerLoadError("Unable to retrieve trainer pricing or available trainers.");
        }
      } finally {
        if (mounted) setLoadingTrainers(false);
      }
    }
    void loadTrainerConfig();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (proofPreviewUrl) {
        URL.revokeObjectURL(proofPreviewUrl);
      }
    };
  }, [proofPreviewUrl]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Please upload a valid JPEG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Payment image exceeds 5MB limit.");
      return;
    }

    setProofFile(file);
    const objectUrl = URL.createObjectURL(file);
    setProofPreviewUrl(objectUrl);
  };

  const handleRegister = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Full name and phone number are required.");
      return;
    }
    if (!form.gender) {
      toast.error("Gender is required. Please select Male or Female.");
      return;
    }
    const dupPhone = state.members.find(m => m.phone === form.phone.trim());
    if (dupPhone) {
      toast.error(`Phone number already registered: ${dupPhone.name}`);
      return;
    }
    const plan = state.plans.find(p => p.id === form.planId);
    if (!plan) {
      toast.error("Please choose a membership plan that matches the category.");
      return;
    }
    if (form.category === "STUDENT" && (!form.studentId.trim() || !form.institution.trim())) {
      toast.error("Student ID and institution are required for Student category.");
      return;
    }

    // Validation for Personal Trainer selection
    if (form.needsTrainer) {
      if (!form.trainerId) {
        toast.error("Please select a personal trainer from the dropdown list.");
        return;
      }
      if (trainers.length === 0) {
        toast.error("No active personal trainers are available. Please register without a trainer or contact Admin.");
        return;
      }
      if (trainerFee <= 0) {
        toast.error("No monthly personal trainer fee is configured in the system.");
        return;
      }
    }

    if (form.paymentMethod !== "CASH" && !proofFile) {
      toast.error("Payment photo is required for Telebirr and CBE Birr payments.");
      return;
    }

    setSubmitting(true);
    try {
      const selectedTrainer = trainers.find(t => t.id === form.trainerId);
      const result = await registerMemberByReception({
        name: form.name.trim(),
        phone: form.phone.trim(),
        gender: form.gender,
        category: form.category,
        planId: plan.id,
        planName: plan.name,
        proofFile: form.paymentMethod === "CASH" ? null : proofFile,
        paymentMethod: form.paymentMethod,
        studentId: form.category === "STUDENT" ? form.studentId.trim() : undefined,
        institution: form.category === "STUDENT" ? form.institution.trim() : undefined,
        needsTrainer: form.needsTrainer,
        trainerId: form.needsTrainer ? form.trainerId : undefined,
      });

      const newMember: Member = {
        id: result.customerId,
        name: form.name.trim(),
        phone: form.phone.trim(),
        gender: form.gender,
        memberId: result.customerCode,
        planId: form.planId,
        joinDate: new Date().toISOString().split("T")[0],
        expiryDate: result.expiryDate || new Date(Date.now() + plan.durationDays * 86400000).toISOString().split("T")[0],
        status: "active",
        lastVisit: null,
        emailNotifications: false,
        balanceDue: 0,
        category: form.category,
        studentId: form.category === "STUDENT" ? form.studentId.trim() : undefined,
        institution: form.category === "STUDENT" ? form.institution.trim() : undefined,
        studentVerified: form.category === "STUDENT" ? true : undefined,
        paymentProofPath: result.proofPath,
      };

      dispatch({ type: "ADD_MEMBER", payload: newMember });
      addAudit(
        dispatch,
        "Member registered",
        actor,
        `${form.name.trim()} · ${categoryLabelOf(state, form.category)} · ${plan.name} · ${
          form.needsTrainer ? `Personal Trainer: ${selectedTrainer?.fullName || "Assigned"} (+${trainerFee} ETB) · ` : ""
        }Payment recorded in Supabase (${result.totalAmount || totalAmountDue} ETB)`
      );

      toast.success(
        `${form.name.trim()} registered successfully! Member code: ${result.customerCode}${
          form.needsTrainer ? ` (Assigned to Coach ${selectedTrainer?.fullName || "Trainer"})` : ""
        }`
      );

      if (result.tempPassword) {
        setCreatedCredentials({
          fullName: form.name.trim(),
          customerId: result.customerCode,
          loginId: result.loginId || result.customerCode,
          tempPassword: result.tempPassword,
        });
      }

      setForm(emptyForm());
      setProofFile(null);
      if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
      setProofPreviewUrl(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Member registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-sm">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Plus className="w-5 h-5 text-lime-400" /> {t("staff.registerTitle")}
        </h3>

        {/* Client Category */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            {t("member.categoryLabel")}
          </label>
          <select
            value={form.category}
            onChange={e => {
              const category = e.target.value as CustomerCategory;
              const next = state.plans.find(p => p.active && planAppliesToCategory(p, category));
              setForm({ ...form, category, planId: next ? next.id : "" });
            }}
            data-testid="staff-category-select"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-lime-400/50"
          >
            {ALL_CATEGORIES.map(c => (
              <option key={c} value={c}>
                {categoryLabelOf(state, c)}
              </option>
            ))}
          </select>
        </div>

        {/* Full Name */}
        <input
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          placeholder="Full name *"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50"
        />

        {/* Phone Number */}
        <input
          value={form.phone}
          onChange={e => setForm({ ...form, phone: e.target.value })}
          placeholder="Phone number *"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50"
        />

        {/* Gender Selection (Required) */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide flex items-center justify-between">
            <span>Gender *</span>
            <span className="text-[11px] font-normal text-zinc-500 lowercase">
              {form.gender ? `${form.gender} selected` : "required for locker room assignment"}
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setForm({ ...form, gender: "Male" })}
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 cursor-pointer ${
                form.gender === "Male"
                  ? "bg-lime-400 text-zinc-950 border-lime-400 shadow-md shadow-lime-400/10"
                  : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:bg-zinc-750"
              }`}
            >
              <GenderMale weight="bold" className="w-4 h-4" />
              <span>Male</span>
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, gender: "Female" })}
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 cursor-pointer ${
                form.gender === "Female"
                  ? "bg-pink-400 text-zinc-950 border-pink-400 shadow-md shadow-pink-400/10"
                  : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:bg-zinc-750"
              }`}
            >
              <GenderFemale weight="bold" className="w-4 h-4" />
              <span>Female</span>
            </button>
          </div>
        </div>

        {/* Student Specific Fields */}
        {form.category === "STUDENT" && (
          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.studentId}
              onChange={e => setForm({ ...form, studentId: e.target.value })}
              placeholder="Student ID number *"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50"
            />
            <input
              value={form.institution}
              onChange={e => setForm({ ...form, institution: e.target.value })}
              placeholder="Institution *"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50"
            />
          </div>
        )}

        {/* Membership Plan Selection */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Membership Plan *
          </label>
          <select
            value={form.planId}
            onChange={e => setForm({ ...form, planId: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-lime-400/50"
          >
            <option value="">Choose a membership plan...</option>
            {applicablePlans.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} - {formatETB(p.price)}
              </option>
            ))}
          </select>
        </div>

        {/* Personal Trainer Question */}
        <div className="space-y-2 pt-2 border-t border-zinc-800">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ChalkboardTeacher weight="bold" className="w-4 h-4 text-lime-400" />
              Does this member need a personal trainer?
            </span>
            <span className="text-[11px] font-normal text-zinc-400 lowercase">
              {form.needsTrainer ? "personal training selected" : "membership only"}
            </span>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, needsTrainer: false, trainerId: "" })}
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all border ${
                !form.needsTrainer
                  ? "bg-lime-400 text-zinc-950 border-lime-400 shadow-md shadow-lime-400/10"
                  : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:bg-zinc-750"
              }`}
            >
              No (Standard Membership)
            </button>
            <button
              type="button"
              onClick={() => {
                const firstTrainerId = trainers.length > 0 ? trainers[0].id : "";
                setForm({ ...form, needsTrainer: true, trainerId: form.trainerId || firstTrainerId });
              }}
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all border ${
                form.needsTrainer
                  ? "bg-lime-400 text-zinc-950 border-lime-400 shadow-md shadow-lime-400/10"
                  : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:bg-zinc-750"
              }`}
            >
              Yes (Personal Trainer)
            </button>
          </div>

          {/* When Reception Selects Yes: Trainer selection and pricing */}
          {form.needsTrainer && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 pt-2"
            >
              {/* Configured monthly fee info callout */}
              <div className="bg-lime-400/10 border border-lime-400/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-lime-300">
                <Info weight="fill" className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  Monthly personal trainer fee configured by Admin:{" "}
                  <strong className="text-white font-mono text-sm">{formatETB(trainerFee)}</strong> / month.
                  This will be added to the membership amount for the first billing period and automatically included in future renewals.
                </div>
              </div>

              {/* Trainer dropdown */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wide flex items-center justify-between">
                  <span>Select Personal Trainer *</span>
                  {loadingTrainers && <span className="text-[10px] text-zinc-500 animate-pulse">Loading trainers…</span>}
                </label>

                {trainerLoadError ? (
                  <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl p-3">
                    {trainerLoadError}
                  </p>
                ) : trainers.length === 0 && !loadingTrainers ? (
                  <p className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-xl p-3">
                    No active trainers are currently registered. Please contact Admin to register trainers before adding personal training.
                  </p>
                ) : (
                  <select
                    value={form.trainerId}
                    onChange={e => setForm({ ...form, trainerId: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-lime-400/50"
                  >
                    <option value="">Choose an assigned trainer...</option>
                    {trainers.map(t => (
                      <option key={t.id} value={t.id}>
                        Coach {t.fullName} — {t.specialization} ({t.activeMembersCount} active members)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* Payment Method */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Payment Method
          </label>
          <select
            value={form.paymentMethod}
            onChange={e => {
              const val = e.target.value;
              setForm({ ...form, paymentMethod: val });
              if (val === "CASH") {
                setProofFile(null);
                if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
                setProofPreviewUrl(null);
              }
            }}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-lime-400/50"
          >
            <option value="CASH">Cash</option>
            <option value="TELEBIRR">Telebirr</option>
            <option value="CBE_BIRR">CBE Birr</option>
          </select>
        </div>

        {/* PAYMENT PHOTO UPLOAD (Hidden for Cash, required for Telebirr / CBE Birr) */}
        {form.paymentMethod !== "CASH" && (
          <div className="space-y-2 pt-1">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <Camera weight="bold" className="w-4 h-4 text-lime-400" />
              Payment Photo (Required) *
            </label>
            <p className="text-xs text-zinc-400">
              Open camera or select an image from gallery to upload transfer receipt for {form.paymentMethod === "TELEBIRR" ? "Telebirr" : "CBE Birr"}.
            </p>

            <div className="space-y-3">
              <label className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full cursor-pointer rounded-xl border border-dashed border-zinc-700 bg-zinc-800/80 p-4 text-sm font-semibold text-zinc-200 hover:border-lime-400 hover:bg-zinc-800 transition-colors">
                <Camera className="w-5 h-5 text-lime-400 shrink-0" />
                <span className="text-center sm:text-left">
                  {proofFile ? "Change / Retake Payment Photo" : "Take photo with camera or choose from gallery"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </label>

              {proofFile && (
                <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-300 font-medium truncate">
                      Selected: <strong>{proofFile.name}</strong>
                    </span>
                    <span className="text-zinc-500 font-mono shrink-0">
                      {(proofFile.size / 1024).toFixed(0)} KB
                    </span>
                  </div>

                  {proofPreviewUrl && (
                    <div className="relative rounded-lg overflow-hidden bg-black max-h-48 flex items-center justify-center border border-zinc-700">
                      <img
                        src={proofPreviewUrl}
                        alt="Payment evidence preview"
                        className="max-h-48 w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setProofFile(null);
                          if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
                          setProofPreviewUrl(null);
                        }}
                        className="absolute top-2 right-2 rounded-full bg-zinc-950/80 p-1.5 text-zinc-300 hover:text-white hover:bg-red-600 transition-colors"
                        title="Remove image"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Real Summary Breakdown */}
        {selectedPlan && (
          <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4 space-y-2 text-xs">
            <div className="text-[11px] uppercase tracking-wider font-bold text-zinc-400 mb-1">
              Registration Fee Summary
            </div>
            <div className="flex justify-between text-zinc-300">
              <span>Membership fee ({selectedPlan.name}):</span>
              <span className="font-semibold text-white">{formatETB(selectedPlan.price)}</span>
            </div>
            {form.needsTrainer && (
              <div className="flex justify-between text-lime-300">
                <span>Monthly personal trainer fee:</span>
                <span className="font-semibold">{formatETB(trainerFee)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-zinc-700 pt-2 text-sm">
              <span className="font-bold text-white">Total due for first period:</span>
              <span className="font-black text-lime-400 text-base">{formatETB(totalAmountDue)}</span>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleRegister}
          disabled={
            submitting ||
            !form.name.trim() ||
            !form.phone.trim() ||
            !form.planId ||
            (form.paymentMethod !== "CASH" && !proofFile) ||
            (form.needsTrainer && (!form.trainerId || trainers.length === 0 || trainerFee <= 0))
          }
          className="w-full bg-lime-400 text-zinc-950 font-black py-3.5 rounded-xl hover:bg-lime-300 transition-all disabled:opacity-40 active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-lime-400/10 mt-2"
        >
          {submitting ? (
            <span>{form.paymentMethod === "CASH" ? "Registering member…" : "Uploading photo & registering…"}</span>
          ) : (
            <span>
              Register member {totalAmountDue > 0 ? `(${formatETB(totalAmountDue)})` : ""}
            </span>
          )}
        </button>
      </div>

      {/* Customer Credentials Success Modal */}
      <AnimatePresence>
        {createdCredentials && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-lime-400/20 text-lime-400 flex items-center justify-center">
                  <Key weight="duotone" className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Customer Login Credentials</h3>
                  <p className="text-xs text-zinc-400">Account successfully created</p>
                </div>
              </div>

              <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4 space-y-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Customer Name</div>
                  <div className="text-sm font-semibold text-white mt-0.5">{createdCredentials.fullName}</div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-700/40">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Customer ID</div>
                    <div className="text-sm font-mono font-semibold text-cyan-300 mt-0.5">{createdCredentials.customerId}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Login ID</div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="text-sm font-mono font-bold text-white">{createdCredentials.loginId}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(createdCredentials.loginId);
                          setCopiedField("login");
                          toast.success("Login ID copied!");
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                        className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                        title="Copy Login ID"
                      >
                        {copiedField === "login" ? <CheckCircle weight="fill" className="w-4 h-4 text-lime-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-700/40">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Generated Temporary Password</div>
                  <div className="flex items-center justify-between gap-2 mt-1 bg-zinc-950/80 border border-zinc-700/60 rounded-lg px-3 py-2">
                    <span className="font-mono text-base font-bold text-lime-400 tracking-wider">
                      {createdCredentials.tempPassword}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (createdCredentials.tempPassword) {
                          navigator.clipboard.writeText(createdCredentials.tempPassword);
                          setCopiedField("password");
                          toast.success("Temporary password copied!");
                          setTimeout(() => setCopiedField(null), 2000);
                        }
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 hover:text-white transition-colors"
                    >
                      {copiedField === "password" ? (
                        <>
                          <CheckCircle weight="fill" className="w-3.5 h-3.5 text-lime-400" />
                          <span className="text-lime-400 font-semibold">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-amber-400/10 border border-amber-400/30 p-3 flex gap-2.5 text-xs text-amber-200">
                <Warning weight="fill" className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <p>
                  <strong>Important Security Notice:</strong> Please provide these credentials to the customer immediately. Instruct them to keep these credentials safe and change their password upon initial login. For security reasons, this temporary password cannot be retrieved again.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCreatedCredentials(null)}
                className="w-full py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-zinc-950 font-black text-sm transition-colors"
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SteamView() {
  return <SteamManagement isAdmin={false} canManageServices={true} />;
}
