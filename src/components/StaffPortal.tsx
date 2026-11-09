import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Users, MagnifyingGlass, CheckCircle, User, Plus, Clock, Warning, GraduationCap, MoonStars, MusicNotes, Sparkle, Lockers, Camera, X, Key, Copy, GenderMale, GenderFemale } from "@phosphor-icons/react";
import { useGym, useT, formatETB, addAudit, planAppliesToCategory, categoryLabelOf } from "../context/GymContext";
import type { CustomerCategory, Member } from "../types";
import { toast } from "sonner";
import { fetchCategories } from "../services/categories";
import LockersManagement from "./LockersManagement";
import SteamManagement from "./SteamManagement";
import ContactMessagesView from "./ContactMessagesView";
import { searchCustomersForCheckIn, type CheckInCustomer } from "../services/checkInService";
import { registerMemberByReception } from "../services/memberRegistrationService";
import {
  fetchMonthlyTrainerFee,
  fetchActiveTrainers,
  type ActiveTrainer,
  fetchReceptionTrainersDirectory,
  receptionResetTrainerPassword,
  type ReceptionTrainerRecord,
} from "../services/personalTrainerService";
import { receptionResetCustomerPassword } from "../services/customers";
import { ChalkboardTeacher, Info, ArrowLeft, Eye } from "@phosphor-icons/react";

const CATEGORY_ICONS: Record<string, typeof Sparkle> = {
  REGULAR: Sparkle,
  STUDENT: GraduationCap,
  MUSLIM: MoonStars,
  AEROBICS: MusicNotes,
};
function CategoryBadge({ category }: { category: CustomerCategory }) {
  const { state } = useGym();
  const Icon = (category ? CATEGORY_ICONS[category] : null) || Sparkle;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-300">
      <Icon weight="fill" className="w-3 h-3 text-lime-400" />
      {categoryLabelOf(state, category)}
    </span>
  );
}

const TABS = ["directory", "lockers", "steam", "register", "contact_messages"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  directory: "staff.tab.directory",
  lockers: "staff.tab.lockers",
  steam: "staff.tab.steam",
  register: "staff.tab.register",
  contact_messages: "staff.tab.contact_messages",
};

const TAB_TO_SLUG: Record<Tab, string> = {
  directory: "dashboard",
  lockers: "lockers",
  steam: "steam",
  register: "register",
  contact_messages: "contact-messages",
};

const SLUG_TO_TAB: Record<string, Tab> = {
  dashboard: "directory",
  directory: "directory",
  members: "directory",
  trainers: "directory",
  lockers: "lockers",
  steam: "steam",
  register: "register",
  "contact-messages": "contact_messages",
  contact_messages: "contact_messages",
};

export default function StaffPortal() {
  const t = useT();
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const tab: Tab = (section && SLUG_TO_TAB[section.toLowerCase()]) || "directory";

  const handleTabChange = (nextTab: Tab) => {
    navigate(`/reception/${TAB_TO_SLUG[nextTab]}`);
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <Users weight="fill" className="w-6 h-6 text-lime-400" />
          <h1 className="text-2xl font-black uppercase tracking-tight">{t("staff.title")}</h1>
        </div>
        {/* Mobile Navigation Dropdown (<640px) */}
        <div className="block sm:hidden mb-6">
          <label htmlFor="staff-portal-tab-select" className="sr-only">Select staff section</label>
          <select
            id="staff-portal-tab-select"
            value={tab}
            onChange={(e) => handleTabChange(e.target.value as Tab)}
            className="w-full min-h-[44px] bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-lime-400 transition-colors"
          >
            {TABS.map((key) => (
              <option key={key} value={key}>
                {t(TAB_LABEL[key])}
              </option>
            ))}
          </select>
        </div>

        {/* Desktop Navigation Tabs (>=640px) */}
        <div className="hidden sm:flex gap-2 mb-8 overflow-x-auto pb-1">
          {TABS.map(key => (
            <button key={key} onClick={() => handleTabChange(key)} className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors min-h-[44px] flex items-center ${tab === key ? "bg-lime-400 text-zinc-950 font-bold" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>{t(TAB_LABEL[key])}</button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {tab === "directory" && <MemberAndTrainerDirectoryView />}
            {tab === "lockers" && <LockersManagement canManage />}
            {tab === "steam" && <SteamView />}
            {tab === "register" && <RegisterView />}
            {tab === "contact_messages" && <ContactMessagesView />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function MemberAndTrainerDirectoryView() {
  const { state } = useGym();

  // Sub-tabs: "members" | "trainers"
  const [subTab, setSubTab] = useState<"members" | "trainers">("members");

  // === MEMBERS TAB STATE ===
  const [memberSearch, setMemberSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CustomerCategory | "ALL">("ALL");
  const [memberResults, setMemberResults] = useState<CheckInCustomer[]>([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<CheckInCustomer | null>(null);

  // === CUSTOMER PASSWORD RESET STATE ===
  const [resetConfirmMember, setResetConfirmMember] = useState<CheckInCustomer | null>(null);
  const [isResettingCustomerPassword, setIsResettingCustomerPassword] = useState(false);
  const [customerResetSuccessData, setCustomerResetSuccessData] = useState<{
    customerName: string;
    customerCode: string;
    tempPassword: string;
  } | null>(null);
  const [copiedCustomerResetField, setCopiedCustomerResetField] = useState<boolean>(false);

  // === TRAINERS TAB STATE ===
  const [trainerSearch, setTrainerSearch] = useState("");
  const [trainers, setTrainers] = useState<ReceptionTrainerRecord[]>([]);
  const [isLoadingTrainers, setIsLoadingTrainers] = useState(false);
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(null);
  const selectedTrainer = trainers.find(tr => tr.id === selectedTrainerId) ?? null;

  // === TRAINER PASSWORD RESET STATE ===
  const [resetConfirmTrainer, setResetConfirmTrainer] = useState<ReceptionTrainerRecord | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetSuccessData, setResetSuccessData] = useState<{
    trainerName: string;
    loginId: string;
    tempPassword: string;
  } | null>(null);
  const [copiedResetField, setCopiedResetField] = useState<boolean>(false);

  // Load trainers from Supabase
  const loadTrainers = useCallback(async () => {
    setIsLoadingTrainers(true);
    try {
      const data = await fetchReceptionTrainersDirectory();
      setTrainers(data);
    } catch (err) {
      console.error("Failed to load trainers directory:", err);
      toast.error("Unable to load trainers directory from database.");
    } finally {
      setIsLoadingTrainers(false);
    }
  }, []);

  useEffect(() => {
    if (subTab === "trainers") {
      void loadTrainers();
    }
  }, [subTab, loadTrainers]);

  // Search members in Supabase (debounced for input, immediate on category toggle)
  useEffect(() => {
    let active = true;
    const q = memberSearch.trim();

    setIsSearchingMembers(true);
    const delay = q ? 200 : 0;
    const timer = setTimeout(async () => {
      try {
        const data = await searchCustomersForCheckIn(q, categoryFilter);
        if (active) {
          setMemberResults(data);
        }
      } catch (err) {
        if (active) {
          console.error("Customer directory search failed:", err);
          toast.error("Unable to search members from database.");
        }
      } finally {
        if (active) setIsSearchingMembers(false);
      }
    }, delay);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [memberSearch, categoryFilter]);

  // Handler for Trainer Password Reset
  const handleExecuteResetPassword = async () => {
    if (!resetConfirmTrainer) return;
    setIsResettingPassword(true);
    try {
      const result = await receptionResetTrainerPassword(resetConfirmTrainer.id);
      setResetSuccessData({
        trainerName: result.trainerName,
        loginId: result.loginId,
        tempPassword: result.newTempPassword,
      });
      setResetConfirmTrainer(null);
      toast.success(`Temporary password generated for Coach ${result.trainerName}`);
      void loadTrainers();
    } catch (err) {
      console.error("Password reset failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to reset trainer password.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Handler for Customer Password Reset
  const handleExecuteCustomerResetPassword = async () => {
    if (!resetConfirmMember) return;
    setIsResettingCustomerPassword(true);
    try {
      const result = await receptionResetCustomerPassword(resetConfirmMember.id);
      setCustomerResetSuccessData({
        customerName: result.customerName,
        customerCode: result.customerCode,
        tempPassword: result.newTempPassword,
      });
      setResetConfirmMember(null);
      setCopiedCustomerResetField(false);
      toast.success(`Temporary password generated for ${result.customerName}`);
    } catch (err) {
      console.error("Customer password reset failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to reset customer password.");
    } finally {
      setIsResettingCustomerPassword(false);
    }
  };


  const renderMemberStatusBadge = (customer: CheckInCustomer) => {
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

  // Filter trainers based on search input
  const filteredTrainers = trainers.filter(tr => {
    if (!trainerSearch.trim()) return true;
    const term = trainerSearch.toLowerCase().trim();
    return (
      tr.fullName.toLowerCase().includes(term) ||
      (tr.loginId && tr.loginId.toLowerCase().includes(term)) ||
      tr.specialization.toLowerCase().includes(term) ||
      tr.phone.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation: Members vs Trainers */}
      <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3 border-b border-zinc-800 pb-4">
        <button
          onClick={() => {
            setSubTab("members");
            setSelectedTrainerId(null);
          }}
          className={`min-h-[44px] flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            subTab === "members"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/15"
              : "bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-850"
          }`}
        >
          <Users weight={subTab === "members" ? "fill" : "bold"} className="w-4 h-4 shrink-0" />
          <span>Members</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-mono font-semibold ${
              subTab === "members" ? "bg-zinc-950 text-lime-400" : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {memberResults.length}
          </span>
        </button>

        <button
          onClick={() => {
            setSubTab("trainers");
          }}
          className={`min-h-[44px] flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            subTab === "trainers"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/15"
              : "bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-850"
          }`}
        >
          <ChalkboardTeacher weight={subTab === "trainers" ? "fill" : "bold"} className="w-4 h-4 shrink-0" />
          <span>Trainers</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-mono font-semibold ${
              subTab === "trainers" ? "bg-zinc-950 text-lime-400" : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {trainers.length}
          </span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 1. MEMBERS SUB-TAB                                                    */}
      {/* ==================================================================== */}
      {subTab === "members" && (
        <div className="space-y-6">
          {/* Search Input */}
          <div className="relative">
            <MagnifyingGlass className="w-6 h-6 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              placeholder="Search members by name, phone or Member ID (e.g. P-0001)..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-white text-lg placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50"
            />
            {isSearchingMembers && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                <Clock className="w-4 h-4 animate-spin text-lime-400" />
                <span>Searching database...</span>
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
              All Categories
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

          {/* Member Results List */}
          {memberResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold px-1">
                <span>
                  {memberSearch
                    ? `Search results for "${memberSearch}"`
                    : categoryFilter === "ALL"
                    ? "Registered Members"
                    : `${categoryLabelOf(state, categoryFilter)} Members`}
                </span>
                <span className="bg-zinc-800 text-lime-400 px-2 py-0.5 rounded-full font-mono">
                  {memberResults.length} member{memberResults.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="space-y-2">
                {memberResults.map(c => {
                  const isMemExpired = !c.membership || c.membership.isExpired;
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
                            {renderMemberStatusBadge(c)}
                            <CategoryBadge category={c.category} />
                            {c.gender && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-800 text-zinc-300">
                                {c.gender}
                              </span>
                            )}
                            {c.activeLockerNumber && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-400/15 text-amber-400 border border-amber-400/20">
                                <Lockers weight="fill" className="w-3 h-3" />
                                Locker {c.activeLockerNumber}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-3">
                            <span>Phone: <strong className="text-zinc-200">{c.phone}</strong></span>
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
                          onClick={() => setResetConfirmMember(c)}
                          className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-400/10 text-amber-300 hover:bg-amber-400 hover:text-zinc-950 border border-amber-400/25 transition-all flex items-center gap-1.5"
                          title="Reset customer login password"
                        >
                          <Key weight="bold" className="w-3.5 h-3.5" />
                          <span>Reset Password</span>
                        </button>
                        <button
                          onClick={() => setSelectedMember(c)}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-800 text-zinc-200 hover:text-white hover:bg-zinc-700 transition-colors flex items-center gap-1.5"
                        >
                          <Eye className="w-4 h-4" />
                          <span>View Profile</span>
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty States */}
          {!isSearchingMembers && memberResults.length === 0 && (
            <div className="text-center py-12 text-zinc-500 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl">
              <Warning className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
              <p className="font-semibold text-white text-base">
                {memberSearch ? "No members found" : "No members found in this category"}
              </p>
              <p className="text-sm mt-1">
                {memberSearch
                  ? "Try searching by a different name, phone number or Member ID."
                  : "No customers match the selected filter. Try searching by name, phone, or Member ID."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. TRAINERS SUB-TAB                                                   */}
      {/* ==================================================================== */}
      {subTab === "trainers" && (
        <div className="space-y-6">
          {!selectedTrainer ? (
            /* TRAINERS DIRECTORY LIST VIEW */
            <div className="space-y-6">
              {/* Trainer Search Bar */}
              <div className="relative">
                <MagnifyingGlass className="w-6 h-6 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  value={trainerSearch}
                  onChange={e => setTrainerSearch(e.target.value)}
                  placeholder="Search trainers by name, phone, specialization, or Login ID..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-white text-lg placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50"
                />
                {isLoadingTrainers && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 animate-spin text-lime-400" />
                    <span>Loading trainers...</span>
                  </div>
                )}
              </div>

              {/* Trainers Count Badge */}
              <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold px-1">
                <span>Registered Personal Trainers</span>
                <span className="bg-zinc-800 text-lime-400 px-2 py-0.5 rounded-full font-mono">
                  {filteredTrainers.length} trainer{filteredTrainers.length === 1 ? "" : "s"}
                </span>
              </div>

              {/* Trainers Grid */}
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
                {filteredTrainers.map(tr => (
                  <motion.div
                    key={tr.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => setSelectedTrainerId(tr.id)}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-lime-400/40 transition-all cursor-pointer group space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700/60 flex items-center justify-center shrink-0 group-hover:border-lime-400/50 transition-colors">
                          <ChalkboardTeacher weight="duotone" className="w-6 h-6 text-lime-400" />
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-base group-hover:text-lime-300 transition-colors">
                            Coach {tr.fullName}
                          </h4>
                          <p className="text-xs text-zinc-400">{tr.specialization}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        {tr.isActive ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-lime-400/20 text-lime-400 border border-lime-400/30">
                            Active
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                            Inactive
                          </span>
                        )}
                        {tr.loginId && (
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-cyan-300 font-semibold">
                            {tr.loginId}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 pt-3 border-t border-zinc-800/80">
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-bold">Phone</span>
                        <span className="text-zinc-200 font-medium">{tr.phone || "No phone"}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-bold">Assigned Members</span>
                        <span className="text-lime-400 font-bold font-mono">
                          {tr.activeMembersCount} active ({tr.assignedMembers.length} total)
                        </span>
                      </div>
                    </div>

                    <div className="pt-1 flex items-center justify-between text-xs text-lime-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                      <span>View assigned members & actions →</span>
                    </div>
                  </motion.div>
                ))}
              </div>

              {!isLoadingTrainers && filteredTrainers.length === 0 && (
                <div className="text-center py-12 text-zinc-500 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl">
                  <Warning className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
                  <p className="font-semibold text-white text-base">No trainers found</p>
                  <p className="text-sm mt-1">No trainers match your search criteria.</p>
                </div>
              )}
            </div>
          ) : (
            /* TRAINER DETAILS & ASSIGNED MEMBERS VIEW */
            <div className="space-y-6">
              {/* Back Navigation Button */}
              <button
                onClick={() => setSelectedTrainerId(null)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-white transition-colors py-1 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to All Trainers</span>
              </button>

              {/* Selected Trainer Header Card */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700/60 flex items-center justify-center shrink-0">
                      <ChalkboardTeacher weight="duotone" className="w-8 h-8 text-lime-400" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-xl font-bold text-white">Coach {selectedTrainer.fullName}</h3>
                        {selectedTrainer.loginId && (
                          <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-zinc-800 text-cyan-300 font-bold border border-cyan-400/20">
                            {selectedTrainer.loginId}
                          </span>
                        )}
                        {selectedTrainer.isActive ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-lime-400/20 text-lime-400 border border-lime-400/30">
                            Active Trainer
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-400">{selectedTrainer.specialization}</p>
                      <div className="flex items-center gap-4 text-xs text-zinc-400 pt-0.5">
                        {selectedTrainer.phone && <span>Phone: <strong className="text-zinc-200">{selectedTrainer.phone}</strong></span>}
                        {selectedTrainer.email && <span>Email: <strong className="text-zinc-200">{selectedTrainer.email}</strong></span>}
                      </div>
                    </div>
                  </div>

                  {/* Reset Password Action Button */}
                  <div className="self-start sm:self-center shrink-0">
                    <button
                      onClick={() => setResetConfirmTrainer(selectedTrainer)}
                      className="px-4 py-2.5 rounded-xl font-bold text-xs bg-amber-400/15 text-amber-300 border border-amber-400/30 hover:bg-amber-400/25 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Key weight="bold" className="w-4 h-4 text-amber-400" />
                      <span>Reset Trainer Password</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Assigned Members Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h4 className="font-bold text-base text-white flex items-center gap-2">
                    <Users weight="fill" className="w-5 h-5 text-lime-400" />
                    <span>Members Assigned to Coach {selectedTrainer.fullName}</span>
                  </h4>
                  <span className="bg-zinc-800 text-lime-400 px-3 py-1 rounded-full text-xs font-mono font-bold">
                    {selectedTrainer.assignedMembers.length} member{selectedTrainer.assignedMembers.length === 1 ? "" : "s"}
                  </span>
                </div>

                {selectedTrainer.assignedMembers.length > 0 ? (
                  <div className="space-y-2.5">
                    {selectedTrainer.assignedMembers.map(mem => (
                      <div
                        key={mem.id}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-zinc-700 transition-colors"
                      >
                        <div className="flex items-start sm:items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-zinc-400" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-white text-sm sm:text-base">{mem.customerName}</span>
                              <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-lime-400 font-semibold">
                                {mem.customerCode}
                              </span>
                              <CategoryBadge category={mem.category} />
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  mem.membershipStatus === "ACTIVE"
                                    ? "bg-lime-400/20 text-lime-400"
                                    : "bg-red-400/20 text-red-400"
                                }`}
                              >
                                {mem.membershipStatus}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-400/20 text-cyan-300">
                                PT {mem.assignmentStatus}
                              </span>
                            </div>

                            <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-3">
                              <span>Phone: <strong className="text-zinc-200">{mem.phone || "—"}</strong></span>
                              <span>·</span>
                              <span>Plan: <strong className="text-zinc-200">{mem.planName}</strong></span>
                              {mem.startDate && (
                                <>
                                  <span>·</span>
                                  <span>Assigned: <strong className="text-zinc-200">{mem.startDate}</strong></span>
                                </>
                              )}
                              {mem.membershipEnd && (
                                <>
                                  <span>·</span>
                                  <span>Membership End: <strong className="text-zinc-200">{mem.membershipEnd}</strong></span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-zinc-500 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl">
                    <Users className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
                    <p className="font-semibold text-white text-base">No members currently assigned</p>
                    <p className="text-sm mt-1">This trainer does not have any active member assignments yet.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. MODALS                                                            */}
      {/* ==================================================================== */}

      {/* A. Member Details Modal */}
      <AnimatePresence>
        {selectedMember && (
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
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-lime-400/20 text-lime-400 flex items-center justify-center">
                    <User weight="bold" className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedMember.fullName}</h3>
                    <p className="text-xs text-zinc-400 font-mono">Member ID: {selectedMember.customerCode}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedMember(null)}
                  className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-zinc-500 block text-xs uppercase font-bold">Category</span>
                    <span className="text-white font-semibold">{categoryLabelOf(state, selectedMember.category)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-xs uppercase font-bold">Status</span>
                    {renderMemberStatusBadge(selectedMember)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-700/40">
                  <div>
                    <span className="text-zinc-500 block text-xs uppercase font-bold">Phone</span>
                    <span className="text-white font-semibold">{selectedMember.phone || "—"}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-xs uppercase font-bold">Gender</span>
                    <span className="text-white font-semibold">{selectedMember.gender || "Not specified"}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-700/40">
                  <span className="text-zinc-500 block text-xs uppercase font-bold">Membership Plan</span>
                  <span className="text-white font-semibold">{selectedMember.membership?.planName || "No Plan"}</span>
                  {selectedMember.membership?.startDate && selectedMember.membership?.endDate && (
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {selectedMember.membership.startDate} to {selectedMember.membership.endDate} ({selectedMember.membership.daysRemaining} days remaining)
                    </p>
                  )}
                </div>

                {selectedMember.activeLockerNumber && (
                  <div className="pt-2 border-t border-zinc-700/40">
                    <span className="text-zinc-500 block text-xs uppercase font-bold">Assigned Locker</span>
                    <span className="text-amber-400 font-semibold font-mono">Locker #{selectedMember.activeLockerNumber}</span>
                  </div>
                )}

                {selectedMember.category === "STUDENT" && (
                  <div className="pt-2 border-t border-zinc-700/40">
                    <span className="text-zinc-500 block text-xs uppercase font-bold">Student Verification</span>
                    <span className="text-lime-400 font-semibold">
                      {selectedMember.studentVerified ? "Verified Student" : "Pending Document Verification"}
                    </span>
                    {selectedMember.institution && (
                      <p className="text-xs text-zinc-400 mt-0.5">Institution: {selectedMember.institution}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const memberToReset = selectedMember;
                    setSelectedMember(null);
                    setResetConfirmMember(memberToReset);
                  }}
                  className="px-4 py-2.5 rounded-xl font-bold text-xs bg-amber-400/15 text-amber-300 hover:bg-amber-400 hover:text-zinc-950 border border-amber-400/30 transition-all flex items-center gap-1.5"
                >
                  <Key weight="bold" className="w-4 h-4" />
                  <span>Reset Login Password</span>
                </button>
                <button
                  onClick={() => setSelectedMember(null)}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm bg-zinc-800 text-zinc-200 hover:text-white hover:bg-zinc-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Customer Password Reset Confirmation Modal */}
      <AnimatePresence>
        {resetConfirmMember && (
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
                <div className="w-12 h-12 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Key weight="duotone" className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Reset Customer Password</h3>
                  <p className="text-xs text-zinc-400">{resetConfirmMember.fullName}</p>
                </div>
              </div>

              <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4 space-y-2.5 text-sm text-zinc-300">
                <div className="flex justify-between items-center text-xs pb-2 border-b border-zinc-700/40">
                  <span className="text-zinc-400">Customer ID / Login ID:</span>
                  <span className="font-mono font-bold text-lime-400">{resetConfirmMember.customerCode}</span>
                </div>
                {resetConfirmMember.phone && (
                  <div className="flex justify-between items-center text-xs pb-2 border-b border-zinc-700/40">
                    <span className="text-zinc-400">Phone:</span>
                    <span className="text-white font-medium">{resetConfirmMember.phone}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-xs pb-2 border-b border-zinc-700/40">
                  <span className="text-zinc-400">Category:</span>
                  <span className="text-white font-medium">{categoryLabelOf(state, resetConfirmMember.category)}</span>
                </div>
                <p className="pt-1">
                  Are you sure you want to reset the login password for{" "}
                  <strong className="text-white">{resetConfirmMember.fullName}</strong>?
                </p>
                <p className="text-xs text-amber-400/90 pt-1">
                  • A new secure temporary password will be generated immediately.
                  <br />
                  • The customer will use this temporary password to sign in.
                  <br />
                  • Existing membership, attendance, and locker records are strictly preserved.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setResetConfirmMember(null)}
                  disabled={isResettingCustomerPassword}
                  className="flex-1 bg-zinc-800 text-zinc-300 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteCustomerResetPassword}
                  disabled={isResettingCustomerPassword}
                  className="flex-1 bg-amber-400 text-zinc-950 font-bold text-sm py-2.5 rounded-xl hover:bg-amber-300 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isResettingCustomerPassword ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>Resetting...</span>
                    </>
                  ) : (
                    <span>Confirm Reset</span>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Customer Temporary Password Success Modal */}
      <AnimatePresence>
        {customerResetSuccessData && (
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
                <div className="w-12 h-12 rounded-xl bg-lime-400/20 text-lime-400 flex items-center justify-center shrink-0">
                  <CheckCircle weight="duotone" className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Password Reset Successful</h3>
                  <p className="text-xs text-zinc-400">{customerResetSuccessData.customerName}</p>
                </div>
              </div>

              <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4 space-y-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Customer Login ID</div>
                  <div className="text-sm font-mono font-bold text-cyan-300 mt-0.5">{customerResetSuccessData.customerCode}</div>
                </div>

                <div className="pt-2 border-t border-zinc-700/40">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">New Temporary Password</div>
                  <div className="flex items-center justify-between gap-2 mt-1 bg-zinc-950/70 p-3 rounded-lg border border-zinc-800">
                    <span className="font-mono text-base font-black text-lime-400 tracking-wider">
                      {customerResetSuccessData.tempPassword}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(customerResetSuccessData.tempPassword);
                        setCopiedCustomerResetField(true);
                        toast.success("Temporary password copied to clipboard!");
                        setTimeout(() => setCopiedCustomerResetField(false), 2000);
                      }}
                      className="px-2.5 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 flex items-center gap-1 transition-colors"
                    >
                      {copiedCustomerResetField ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-lime-400" />
                          <span className="text-lime-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-2">
                    Provide this temporary password to the customer. This password is displayed only once and will not be shown again after closing.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCustomerResetSuccessData(null)}
                className="w-full bg-lime-400 text-zinc-950 font-bold text-sm py-2.5 rounded-xl hover:bg-lime-300 transition-colors"
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* B. Trainer Password Reset Confirmation Modal */}
      <AnimatePresence>
        {resetConfirmTrainer && (
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
                <div className="w-12 h-12 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Key weight="duotone" className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Reset Trainer Password</h3>
                  <p className="text-xs text-zinc-400">Coach {resetConfirmTrainer.fullName}</p>
                </div>
              </div>

              <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4 space-y-2 text-sm text-zinc-300">
                <p>
                  Are you sure you want to reset the login password for{" "}
                  <strong className="text-white">{resetConfirmTrainer.fullName}</strong>{" "}
                  ({resetConfirmTrainer.loginId})?
                </p>
                <p className="text-xs text-amber-400/90 pt-1">
                  • A new secure temporary password will be generated immediately.
                  <br />
                  • The trainer's current password will be invalidated.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setResetConfirmTrainer(null)}
                  disabled={isResettingPassword}
                  className="flex-1 bg-zinc-800 text-zinc-300 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteResetPassword}
                  disabled={isResettingPassword}
                  className="flex-1 bg-amber-400 text-zinc-950 font-bold text-sm py-2.5 rounded-xl hover:bg-amber-300 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isResettingPassword ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>Resetting...</span>
                    </>
                  ) : (
                    <span>Confirm Reset</span>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* C. Trainer Temporary Password Success Modal */}
      <AnimatePresence>
        {resetSuccessData && (
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
                <div className="w-12 h-12 rounded-xl bg-lime-400/20 text-lime-400 flex items-center justify-center shrink-0">
                  <CheckCircle weight="duotone" className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Password Reset Successful</h3>
                  <p className="text-xs text-zinc-400">Coach {resetSuccessData.trainerName}</p>
                </div>
              </div>

              <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4 space-y-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Trainer Login ID</div>
                  <div className="text-sm font-mono font-bold text-cyan-300 mt-0.5">{resetSuccessData.loginId}</div>
                </div>

                <div className="pt-2 border-t border-zinc-700/40">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">New Temporary Password</div>
                  <div className="flex items-center justify-between gap-2 mt-1 bg-zinc-950/70 p-3 rounded-lg border border-zinc-800">
                    <span className="font-mono text-base font-black text-lime-400 tracking-wider">
                      {resetSuccessData.tempPassword}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(resetSuccessData.tempPassword);
                        setCopiedResetField(true);
                        toast.success("Temporary password copied to clipboard!");
                        setTimeout(() => setCopiedResetField(false), 2000);
                      }}
                      className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Copy Temporary Password"
                    >
                      {copiedResetField ? (
                        <>
                          <CheckCircle weight="fill" className="w-4 h-4 text-lime-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-amber-300/90 pt-1">
                  ⚠️ Provide this temporary password to Coach {resetSuccessData.trainerName}. For security, this password will not be shown again after closing this window.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setResetSuccessData(null)}
                  className="w-full bg-lime-400 text-zinc-950 font-bold text-sm py-2.5 rounded-xl hover:bg-lime-300 transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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

  // Load configured trainer fee, active trainers, and latest categories from Supabase
  useEffect(() => {
    let mounted = true;

    // Refresh categories dynamically from Supabase
    fetchCategories().then(cats => {
      if (mounted && cats && cats.length > 0) {
        dispatch({ type: "SET_CATEGORIES", payload: cats });
      }
    }).catch(err => {
      console.warn("Unable to load latest customer categories:", err);
    });

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
            {state.categoryLabels
              .filter(c => c.isActive !== false)
              .map(c => (
                <option key={c.category} value={c.category}>
                  {c.label}
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
