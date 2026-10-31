import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  UserPlus,
  MagnifyingGlass,
  CheckCircle,
  CurrencyCircleDollar,
  ArrowsClockwise,
  Warning,
  XCircle,
  X,
  UserSwitch,
  StopCircle,
  User,
  Sparkle,
  Copy,
  Eye,
  EyeSlash,
  Calendar,
  Phone,
  IdentificationBadge,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { formatETB } from "../context/GymContext";
import {
  fetchMonthlyTrainerFee,
  adminSetMonthlyTrainerFee,
  fetchAdminTrainerMonitoringData,
  changeCustomerTrainer,
  stopCustomerPersonalTraining,
  type AdminTrainerMonitoringResult,
  type AdminTrainerItem,
  type AdminTrainerAssignmentItem,
} from "../services/personalTrainerService";
import {
  registerStaffMember,
  type RegisterStaffResult,
} from "../services/staffManagement";

const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-6";
const INPUT =
  "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50 transition-colors text-sm";
const LABEL = "block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5";

export default function AdminTrainerManagement() {
  const [data, setData] = useState<AdminTrainerMonitoringResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fee configuration state
  const [currentFee, setCurrentFee] = useState<number>(500);
  const [newFeeInput, setNewFeeInput] = useState<string>("500");
  const [isUpdatingFee, setIsUpdatingFee] = useState(false);

  // Search
  const [search, setSearch] = useState("");

  // Member drill-down modal
  const [selectedTrainer, setSelectedTrainer] = useState<AdminTrainerItem | null>(null);
  const [reassigningMember, setReassigningMember] = useState<AdminTrainerAssignmentItem | null>(null);
  const [targetTrainerId, setTargetTrainerId] = useState<string>("");
  const [isReassigning, setIsReassigning] = useState(false);

  // Stopping PT
  const [stoppingMember, setStoppingMember] = useState<AdminTrainerAssignmentItem | null>(null);
  const [isStopping, setIsStopping] = useState(false);

  // Trainer Registration modal
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmittingRegister, setIsSubmittingRegister] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<RegisterStaffResult | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      const [monitoringRes, feeRes] = await Promise.all([
        fetchAdminTrainerMonitoringData(),
        fetchMonthlyTrainerFee(),
      ]);
      setData(monitoringRes);
      setCurrentFee(feeRes);
      setNewFeeInput(String(feeRes));
    } catch (err: any) {
      console.error("Failed to load trainer monitoring data:", err);
      setError(err?.message || "Failed to load trainer monitoring data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    toast.success("Trainer data refreshed.");
  };

  const handleUpdateFee = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedFee = parseFloat(newFeeInput);
    if (isNaN(parsedFee) || parsedFee <= 0) {
      toast.error("Please enter a valid positive trainer fee (greater than 0 ETB).");
      return;
    }

    setIsUpdatingFee(true);
    try {
      await adminSetMonthlyTrainerFee(parsedFee);
      setCurrentFee(parsedFee);
      toast.success(`Monthly personal trainer fee updated to ${formatETB(parsedFee)}.`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update trainer fee.");
    } finally {
      setIsUpdatingFee(false);
    }
  };

  const handleRegisterTrainer = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = fullName.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName || trimmedName.length < 2) {
      toast.error("Please enter the trainer's full name.");
      return;
    }
    if (!trimmedPhone || trimmedPhone.length < 5) {
      toast.error("Please enter a valid phone number.");
      return;
    }

    setIsSubmittingRegister(true);
    try {
      const result = await registerStaffMember({
        fullName: trimmedName,
        phone: trimmedPhone,
        role: "Trainer",
      });

      setCreatedCredentials(result);
      setShowRegisterModal(false);
      setFullName("");
      setPhone("");
      toast.success(`Trainer account created for ${result.fullName}!`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to register trainer.");
    } finally {
      setIsSubmittingRegister(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const text = `PowerPlus Gym — Trainer Login Credentials
Full Name: ${createdCredentials.fullName}
Role: Personal Trainer / Coach
Phone: ${createdCredentials.phone}
Login ID: ${createdCredentials.loginId}
Temporary Password: ${createdCredentials.tempPassword}
Login URL: ${typeof window !== "undefined" ? window.location.origin : ""}/login`;

    navigator.clipboard.writeText(text);
    toast.success("Credentials copied to clipboard!");
  };

  const handleReassignTrainer = async () => {
    if (!reassigningMember || !targetTrainerId) return;
    setIsReassigning(true);
    try {
      await changeCustomerTrainer(reassigningMember.customer_id, targetTrainerId);
      toast.success("Trainer successfully reassigned! No extra fee charged for current period.");
      setReassigningMember(null);
      setTargetTrainerId("");
      await loadData();
      if (selectedTrainer) {
        // update modal view
        setSelectedTrainer(prev => {
          if (!prev) return null;
          return {
            ...prev,
            assignments: prev.assignments.filter(a => a.id !== reassigningMember.id),
            active_members_count: Math.max(0, prev.active_members_count - 1),
          };
        });
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to reassign trainer.");
    } finally {
      setIsReassigning(false);
    }
  };

  const handleStopTraining = async () => {
    if (!stoppingMember) return;
    setIsStopping(true);
    try {
      await stopCustomerPersonalTraining(stoppingMember.customer_id);
      toast.success("Personal training arrangement ended. Future renewals will exclude trainer fees.");
      setStoppingMember(null);
      await loadData();
      if (selectedTrainer) {
        setSelectedTrainer(prev => {
          if (!prev) return null;
          return {
            ...prev,
            assignments: prev.assignments.filter(a => a.id !== stoppingMember.id),
            active_members_count: Math.max(0, prev.active_members_count - 1),
          };
        });
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to stop personal training.");
    } finally {
      setIsStopping(false);
    }
  };

  const trainersList = data?.trainers || [];
  const filteredTrainers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trainersList;
    return trainersList.filter(
      t =>
        t.full_name.toLowerCase().includes(q) ||
        (t.login_id && t.login_id.toLowerCase().includes(q)) ||
        t.phone.toLowerCase().includes(q) ||
        t.specialization.toLowerCase().includes(q)
    );
  }, [trainersList, search]);

  const totalAssignedMembers = useMemo(() => {
    return trainersList.reduce((acc, t) => acc + (t.active_members_count || 0), 0);
  }, [trainersList]);

  const availableOtherTrainers = useMemo(() => {
    if (!selectedTrainer) return trainersList;
    return trainersList.filter(t => t.id !== selectedTrainer.id && t.is_active);
  }, [trainersList, selectedTrainer]);

  return (
    <div className="space-y-6 text-white">
      {/* Top Banner and Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users weight="fill" className="w-6 h-6 text-lime-400" />
            Personal Trainer Management
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Configure monthly personal training fees, register coaches, and monitor assigned members & revenue.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRegisterModal(true)}
            className="bg-lime-400 text-zinc-950 font-bold px-4 py-2.5 rounded-xl hover:bg-lime-300 transition-colors flex items-center gap-2 text-sm shadow-lg shadow-lime-400/10"
          >
            <UserPlus weight="bold" className="w-4 h-4" />
            Register Trainer
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            title="Refresh Data"
          >
            <ArrowsClockwise
              weight="bold"
              className={`w-4 h-4 ${refreshing ? "animate-spin text-lime-400" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Monthly Trainer Fee Configuration Card */}
      <div className={`${CARD} bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-850 border-lime-400/20`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded text-[11px] font-extrabold uppercase tracking-wide bg-lime-400/20 text-lime-400 border border-lime-400/30">
                Monthly Trainer Fee
              </span>
              <span className="text-xs text-zinc-400">Database Price Configuration</span>
            </div>
            <h3 className="text-2xl font-black text-white">
              {formatETB(currentFee)} <span className="text-sm font-normal text-zinc-400">/ month per member</span>
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              This monthly fee is automatically fetched by Reception during new member registration and added to renewal calculations for all members with active personal training. Updating the fee applies to future billing cycles without altering past payments.
            </p>
          </div>

          <form onSubmit={handleUpdateFee} className="flex items-center gap-2 shrink-0">
            <div>
              <label className="text-[10px] text-zinc-400 block mb-1 font-bold uppercase tracking-wider">
                New Monthly Fee (ETB)
              </label>
              <input
                type="number"
                min="1"
                step="any"
                value={newFeeInput}
                onChange={e => setNewFeeInput(e.target.value)}
                placeholder="e.g. 500"
                className="w-36 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-bold text-sm focus:outline-none focus:border-lime-400/50"
              />
            </div>
            <button
              type="submit"
              disabled={isUpdatingFee}
              className="mt-5 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold px-4 py-2 rounded-xl text-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isUpdatingFee ? (
                <div className="w-3.5 h-3.5 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
              ) : null}
              Update Fee
            </button>
          </form>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={CARD}>
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Trainers</span>
            <Users weight="bold" className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {loading ? "..." : data?.summary.total_trainers ?? 0}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Staff with trainer profile</p>
        </div>

        <div className={CARD}>
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Active Trainers</span>
            <CheckCircle weight="fill" className="w-4 h-4 text-lime-400" />
          </div>
          <div className="text-2xl font-black text-lime-400">
            {loading ? "..." : data?.summary.active_trainers ?? 0}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Available for Reception registration</p>
        </div>

        <div className={CARD}>
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Assigned Members</span>
            <User weight="bold" className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {loading ? "..." : totalAssignedMembers}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Active personal training clients</p>
        </div>

        <div className={CARD}>
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Trainer Revenue</span>
            <CurrencyCircleDollar weight="fill" className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">
            {loading ? "..." : formatETB(data?.summary.total_trainer_revenue ?? 0)}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">From verified PT payments</p>
        </div>
      </div>

      {/* Trainers Table */}
      <div className={CARD}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="font-bold text-base text-white">Registered Personal Trainers</h3>
            <p className="text-xs text-zinc-400">
              Overview of all coaches, member load, and assigned client rosters.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <MagnifyingGlass className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, ID, phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-lime-400/50"
            />
          </div>
        </div>

        {error ? (
          <div className="p-4 bg-red-400/10 border border-red-400/20 rounded-xl text-xs text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={loadData}
              className="text-xs text-red-200 underline hover:text-white ml-2"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="py-12 text-center text-zinc-500">
            <div className="w-8 h-8 border-2 border-lime-400/20 border-t-lime-400 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading trainer monitoring records...</p>
          </div>
        ) : filteredTrainers.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">
            <Users className="w-12 h-12 mx-auto text-zinc-700 mb-2" />
            <p className="text-sm font-semibold text-zinc-400">No trainers found</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Click &quot;Register Trainer&quot; to add a new coach.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 pl-2">Trainer</th>
                  <th className="pb-3">Login ID</th>
                  <th className="pb-3">Phone</th>
                  <th className="pb-3">Specialization</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-center">Active Clients</th>
                  <th className="pb-3 text-center">Expired</th>
                  <th className="pb-3 text-right">Revenue</th>
                  <th className="pb-3 text-right pr-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredTrainers.map(tr => (
                  <tr key={tr.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3.5 pl-2 font-semibold text-white">
                      {tr.full_name}
                    </td>
                    <td className="py-3.5 text-zinc-300 font-mono text-[11px]">
                      {tr.login_id || "—"}
                    </td>
                    <td className="py-3.5 text-zinc-400">{tr.phone}</td>
                    <td className="py-3.5 text-zinc-400">{tr.specialization}</td>
                    <td className="py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          tr.is_active
                            ? "bg-lime-400/15 text-lime-400 border border-lime-400/30"
                            : "bg-red-400/15 text-red-400 border border-red-400/30"
                        }`}
                      >
                        {tr.is_active ? "Available" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3.5 text-center">
                      <span className="inline-block px-2 py-0.5 rounded bg-zinc-800 text-white font-bold">
                        {tr.active_members_count}
                      </span>
                    </td>
                    <td className="py-3.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded ${
                          tr.expired_members_count > 0
                            ? "bg-amber-400/10 text-amber-300 border border-amber-400/20 font-bold"
                            : "text-zinc-500"
                        }`}
                      >
                        {tr.expired_members_count}
                      </span>
                    </td>
                    <td className="py-3.5 text-right font-semibold text-lime-400">
                      {formatETB(tr.total_trainer_revenue)}
                    </td>
                    <td className="py-3.5 text-right pr-2">
                      <button
                        onClick={() => setSelectedTrainer(tr)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-semibold text-xs border border-zinc-700 transition-colors"
                      >
                        View Members ({tr.assignments.length})
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trainer Assigned Members Modal */}
      {selectedTrainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h4 className="font-bold text-white text-base flex items-center gap-2">
                  <Users weight="fill" className="w-5 h-5 text-lime-400" />
                  Assigned Members · Coach {selectedTrainer.full_name}
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {selectedTrainer.specialization} · Phone: {selectedTrainer.phone} · ID: {selectedTrainer.login_id || "—"}
                </p>
              </div>
              <button
                onClick={() => setSelectedTrainer(null)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X weight="bold" className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pr-1 space-y-3">
              {selectedTrainer.assignments.length === 0 ? (
                <div className="py-12 text-center text-zinc-500">
                  <User className="w-10 h-10 mx-auto text-zinc-700 mb-2" />
                  <p className="text-sm font-semibold text-zinc-400">No members currently assigned</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Reception can assign members to this trainer during registration.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px]">
                        <th className="pb-2 pl-2">Member</th>
                        <th className="pb-2">Code</th>
                        <th className="pb-2">Phone</th>
                        <th className="pb-2">Membership Status</th>
                        <th className="pb-2">Valid Until</th>
                        <th className="pb-2">Assigned Date</th>
                        <th className="pb-2 text-right pr-2">Manage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {selectedTrainer.assignments.map(a => (
                        <tr key={a.id} className="hover:bg-zinc-800/30">
                          <td className="py-3 pl-2 font-semibold text-white">
                            {a.customer_name}
                          </td>
                          <td className="py-3 text-zinc-400 font-mono text-[11px]">
                            {a.customer_code}
                          </td>
                          <td className="py-3 text-zinc-400">{a.phone}</td>
                          <td className="py-3">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                                a.membership_status === "ACTIVE"
                                  ? "bg-lime-400/15 text-lime-400 border border-lime-400/30"
                                  : a.membership_status === "EXPIRED"
                                  ? "bg-red-400/15 text-red-400 border border-red-400/30"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              {a.membership_status || "ACTIVE"}
                            </span>
                          </td>
                          <td className="py-3 text-zinc-300 font-mono text-[11px]">
                            {a.membership_end_date ? new Date(a.membership_end_date).toLocaleDateString() : "—"}
                          </td>
                          <td className="py-3 text-zinc-400">
                            {new Date(a.assigned_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 text-right pr-2 space-x-1.5">
                            <button
                              onClick={() => {
                                setReassigningMember(a);
                                setTargetTrainerId(availableOtherTrainers[0]?.id || "");
                              }}
                              className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[11px] font-semibold border border-zinc-700 transition-colors"
                              title="Reassign to another coach"
                            >
                              Reassign
                            </button>
                            <button
                              onClick={() => setStoppingMember(a)}
                              className="px-2 py-1 rounded bg-red-400/10 hover:bg-red-400/20 text-red-400 text-[11px] font-semibold border border-red-400/20 transition-colors"
                              title="Stop personal training"
                            >
                              Stop PT
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="border-t border-zinc-800 pt-3 flex justify-end">
              <button
                onClick={() => setSelectedTrainer(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Trainer Dialog */}
      {reassigningMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-lime-400/10 border border-lime-400/20 flex items-center justify-center shrink-0">
                <UserSwitch weight="fill" className="w-5 h-5 text-lime-400" />
              </div>
              <div>
                <h4 className="font-bold text-white text-base">Reassign Member</h4>
                <p className="text-xs text-zinc-400">
                  {reassigningMember.customer_name} ({reassigningMember.customer_code})
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Transfer this member to another active trainer. Historical assignments will be preserved and no additional fee is charged for the current paid billing cycle.
            </p>

            <div>
              <label className={LABEL}>Select New Personal Trainer</label>
              {availableOtherTrainers.length === 0 ? (
                <p className="text-xs text-amber-300 bg-amber-400/10 p-3 rounded-xl border border-amber-400/20">
                  No other active trainers available.
                </p>
              ) : (
                <select
                  value={targetTrainerId}
                  onChange={e => setTargetTrainerId(e.target.value)}
                  className={INPUT}
                >
                  {availableOtherTrainers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} ({t.specialization}) — {t.active_members_count} active clients
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReassigningMember(null)}
                disabled={isReassigning}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReassignTrainer}
                disabled={isReassigning || !targetTrainerId}
                className="flex-1 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                {isReassigning ? (
                  <div className="w-3.5 h-3.5 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
                ) : null}
                Confirm Reassignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop Personal Training Dialog */}
      {stoppingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-400/10 border border-red-400/20 flex items-center justify-center shrink-0">
                <StopCircle weight="fill" className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h4 className="font-bold text-white text-base">Stop Personal Training?</h4>
                <p className="text-xs text-zinc-400">
                  {stoppingMember.customer_name} ({stoppingMember.customer_code})
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Ending personal training closes the active assignment. Future renewals will exclude the personal trainer fee. All past payment and assignment records remain intact.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStoppingMember(null)}
                disabled={isStopping}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl text-xs transition-colors"
              >
                Keep Active
              </button>
              <button
                type="button"
                onClick={handleStopTraining}
                disabled={isStopping}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                {isStopping ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : null}
                Stop Training
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Register Trainer Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus weight="fill" className="w-5 h-5 text-lime-400" />
                <h4 className="font-bold text-white text-base">Register Personal Trainer</h4>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X weight="bold" className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Per gym business rules, trainers are registered using ONLY their Full Name and Phone Number. Email is not required. The system automatically creates their login ID and secure password.
            </p>

            <form onSubmit={handleRegisterTrainer} className="space-y-4">
              <div>
                <label className={LABEL}>
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dawit Tadesse"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className={INPUT}
                />
              </div>

              <div>
                <label className={LABEL}>
                  Phone Number <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 0911223344"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className={INPUT}
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  disabled={isSubmittingRegister}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRegister}
                  className="flex-1 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  {isSubmittingRegister ? (
                    <div className="w-3.5 h-3.5 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
                  ) : (
                    <UserPlus weight="bold" className="w-4 h-4" />
                  )}
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generated Credentials Success Modal */}
      {createdCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-lime-400/40 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl shadow-lime-400/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-lime-400/20 border border-lime-400/40 flex items-center justify-center shrink-0">
                <CheckCircle weight="fill" className="w-6 h-6 text-lime-400" />
              </div>
              <div>
                <h4 className="font-bold text-white text-base">Trainer Account Created!</h4>
                <p className="text-xs text-zinc-400">Share these login credentials with the coach</p>
              </div>
            </div>

            <div className="bg-zinc-800/80 rounded-xl p-4 space-y-2.5 text-xs border border-zinc-700 font-mono">
              <div className="flex justify-between items-center text-zinc-300">
                <span className="text-zinc-500 font-sans">Full Name:</span>
                <span className="font-bold text-white">{createdCredentials.fullName}</span>
              </div>
              <div className="flex justify-between items-center text-zinc-300">
                <span className="text-zinc-500 font-sans">Role:</span>
                <span className="text-lime-400 font-bold">Personal Trainer</span>
              </div>
              <div className="flex justify-between items-center text-zinc-300">
                <span className="text-zinc-500 font-sans">Phone:</span>
                <span className="text-white">{createdCredentials.phone}</span>
              </div>
              <div className="flex justify-between items-center border-t border-zinc-700/80 pt-2">
                <span className="text-zinc-400 font-sans font-bold">Login ID:</span>
                <span className="font-black text-lime-400 text-sm tracking-wide">
                  {createdCredentials.loginId}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400 font-sans font-bold">Temp Password:</span>
                <div className="flex items-center gap-2">
                  <span className="font-black text-white text-sm">
                    {showPassword ? createdCredentials.tempPassword : "••••••••••"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="text-zinc-400 hover:text-white"
                  >
                    {showPassword ? (
                      <EyeSlash className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="flex-1 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Copy weight="bold" className="w-4 h-4" />
                Copy Credentials
              </button>
              <button
                type="button"
                onClick={() => setCreatedCredentials(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-4 py-2.5 rounded-xl text-xs transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
