import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  UserPlus,
  MagnifyingGlass,
  CheckCircle,
  Copy,
  Eye,
  EyeSlash,
  X,
  IdentificationBadge,
  ArrowsClockwise,
  PencilSimple,
  Trash,
  WarningCircle,
  ShieldCheck,
  Check,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useGym } from "../context/GymContext";
import {
  fetchStaffMembers,
  registerStaffMember,
  updateStaffMember,
  deleteStaffMember,
  type StaffMemberRecord,
  type RegisterStaffResult,
} from "../services/staffManagement";

const INPUT =
  "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50 transition-colors text-sm";
const LABEL = "block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5";

export default function AdminStaffManagement() {
  const { state: gymState } = useGym();
  const currentUserId = gymState.currentUser?.id;

  const [staffList, setStaffList] = useState<StaffMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter State
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "Receptionist" | "Trainer">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Registration Modal State
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"Receptionist" | "Trainer">("Receptionist");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Modal State
  const [editingStaff, setEditingStaff] = useState<StaffMemberRecord | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<"Receptionist" | "Trainer">("Receptionist");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editSpecialization, setEditSpecialization] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete / Deactivate Modal State
  const [deletingStaff, setDeletingStaff] = useState<StaffMemberRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Success Confirmation State for Registration
  const [createdCredentials, setCreatedCredentials] = useState<RegisterStaffResult | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const loadStaff = async () => {
    try {
      setError(null);
      const data = await fetchStaffMembers();
      setStaffList(data);
    } catch (err) {
      console.error("Failed to load staff list:", err);
      setError(err instanceof Error ? err.message : "Failed to load staff list.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadStaff();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStaff();
    toast.success("Staff list refreshed.");
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = fullName.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName || trimmedName.length < 2) {
      toast.error("Please enter the staff member's full name (at least 2 characters).");
      return;
    }

    if (!trimmedPhone || trimmedPhone.length < 5) {
      toast.error("Please enter a valid phone number.");
    }

    setIsSubmitting(true);
    try {
      const result = await registerStaffMember({
        fullName: trimmedName,
        phone: trimmedPhone,
        role,
      });

      setCreatedCredentials(result);
      setShowRegisterModal(false);
      setFullName("");
      setPhone("");
      setRole("Receptionist");
      await loadStaff();
      toast.success(`${result.role} account created successfully!`);
    } catch (err) {
      console.error("Failed to create staff member:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create staff member.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal with loaded DB values
  const handleOpenEdit = (staff: StaffMemberRecord) => {
    setEditingStaff(staff);
    setEditFullName(staff.full_name);
    setEditPhone(staff.phone || "");
    setEditRole(staff.role);
    setEditIsActive(staff.is_active);
    setEditSpecialization(staff.specialization || "Fitness Trainer");
  };

  // Submit Edit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;

    const trimmedName = editFullName.trim();
    const trimmedPhone = editPhone.trim();

    if (!trimmedName || trimmedName.length < 2) {
      toast.error("Full name must be at least 2 characters long.");
      return;
    }

    if (!trimmedPhone || trimmedPhone.length < 5) {
      toast.error("Please enter a valid phone number.");
      return;
    }

    setIsUpdating(true);
    try {
      const result = await updateStaffMember({
        userId: editingStaff.id,
        fullName: trimmedName,
        phone: trimmedPhone,
        role: editRole,
        isActive: editIsActive,
        specialization: editRole === "Trainer" ? editSpecialization : undefined,
      });

      toast.success(`Staff member "${result.fullName}" updated successfully.`);
      setEditingStaff(null);
      await loadStaff();
    } catch (err) {
      console.error("Update staff error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update staff member.");
    } finally {
      setIsUpdating(false);
    }
  };

  // Open Delete / Deactivate Modal
  const handleOpenDelete = (staff: StaffMemberRecord) => {
    if (staff.id === currentUserId) {
      toast.error("You cannot delete or deactivate your own administrative account.");
      return;
    }
    setDeletingStaff(staff);
  };

  // Confirm Delete / Deactivate
  const handleConfirmDelete = async () => {
    if (!deletingStaff) return;

    setIsDeleting(true);
    try {
      const res = await deleteStaffMember(deletingStaff.id, false);
      if (res.action === "DEACTIVATED") {
        toast.success(
          `Staff member "${deletingStaff.full_name}" has been deactivated. Historical records preserved.`
        );
      } else {
        toast.success(`Staff member "${deletingStaff.full_name}" was permanently deleted.`);
      }
      setDeletingStaff(null);
      await loadStaff();
    } catch (err) {
      console.error("Delete staff error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete/deactivate staff.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const text = `PowerPlus Gym Staff Login Details:\n• Name: ${createdCredentials.fullName}\n• Role: ${createdCredentials.role}\n• Login ID: ${createdCredentials.loginId}\n• Temporary Password: ${createdCredentials.tempPassword}\n\nPlease log in at the PowerPlus Gym portal.`;
    void navigator.clipboard.writeText(text);
    toast.success("Credentials copied to clipboard.");
  };

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staffList.filter(member => {
      // Role filter
      if (roleFilter !== "ALL" && member.role !== roleFilter) return false;

      // Status filter
      if (statusFilter === "ACTIVE" && !member.is_active) return false;
      if (statusFilter === "INACTIVE" && member.is_active) return false;

      // Search query
      if (!q) return true;
      const matchName = member.full_name.toLowerCase().includes(q);
      const matchLogin = member.login_id.toLowerCase().includes(q);
      const matchPhone = (member.phone || "").toLowerCase().includes(q);
      const matchEmail = (member.email || "").toLowerCase().includes(q);
      return matchName || matchLogin || matchPhone || matchEmail;
    });
  }, [staffList, search, roleFilter, statusFilter]);

  const activeCount = useMemo(() => staffList.filter(s => s.is_active).length, [staffList]);
  const inactiveCount = useMemo(() => staffList.filter(s => !s.is_active).length, [staffList]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
            <Users weight="bold" className="w-6 h-6 text-lime-400" />
            <span>Staff Management</span>
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            Create, update, and manage accounts for Reception staff and Trainers directly.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={loading || refreshing}
            className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            <ArrowsClockwise className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setShowRegisterModal(true)}
            className="flex items-center gap-2 rounded-xl bg-lime-400 px-5 py-2.5 text-sm font-bold text-zinc-950 hover:bg-lime-300 transition-colors shadow-lg shadow-lime-400/10"
          >
            <UserPlus weight="bold" className="h-4 w-4" />
            <span>Register Staff</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total Staff</div>
          <div className="mt-1 text-2xl font-black text-white">{staffList.length}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Configured accounts</div>
        </div>
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">Receptionists</div>
          <div className="mt-1 text-2xl font-black text-cyan-300">
            {staffList.filter(s => s.role === "Receptionist").length}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">Front desk operators</div>
        </div>
        <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Trainers</div>
          <div className="mt-1 text-2xl font-black text-purple-300">
            {staffList.filter(s => s.role === "Trainer").length}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">Fitness & coaching staff</div>
        </div>
        <div className="rounded-2xl border border-lime-500/30 bg-lime-500/5 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-lime-400">Status Ratio</div>
          <div className="mt-1 text-xl font-black text-lime-300 flex items-center gap-2">
            <span>{activeCount} Active</span>
            {inactiveCount > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                {inactiveCount} Inactive
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">Authentication status</div>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <button onClick={() => void loadStaff()} className="font-semibold text-red-300 hover:text-white">
            Retry
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlass className="w-5 h-5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search staff by full name, Login ID, phone, or email..."
            className={`${INPUT} pl-10`}
          />
        </div>

        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value as "ALL" | "Receptionist" | "Trainer")}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-lime-400/50"
        >
          <option value="ALL">All Roles</option>
          <option value="Receptionist">Receptionist</option>
          <option value="Trainer">Trainer</option>
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-lime-400/50"
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active Only</option>
          <option value="INACTIVE">Inactive Only</option>
        </select>
      </div>

      {/* Staff Management Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-16 text-center text-zinc-500">
            <div className="inline-block animate-spin mb-3">
              <ArrowsClockwise className="w-8 h-8 text-lime-400" />
            </div>
            <p className="font-semibold text-white">Loading staff members...</p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-16 text-center text-zinc-500 space-y-3">
            <Users className="w-12 h-12 mx-auto text-zinc-600 mb-2" />
            <p className="font-bold text-white text-base">No staff members found</p>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {staffList.length === 0
                ? "No staff members have been registered yet. Click \"Register Staff\" to create the first account."
                : "No staff members matched your search criteria."}
            </p>
            {staffList.length === 0 && (
              <button
                onClick={() => setShowRegisterModal(true)}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 text-zinc-950 font-bold text-xs uppercase hover:bg-lime-300 transition-colors"
              >
                <UserPlus weight="bold" className="w-4 h-4" />
                <span>Register First Staff</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-800/60 border-b border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-5 py-3.5">Full Name</th>
                  <th className="px-5 py-3.5">Login ID</th>
                  <th className="px-5 py-3.5">Phone Number</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5">Account Status</th>
                  <th className="px-5 py-3.5">Created Date</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredStaff.map(member => {
                  const isReception = member.role === "Receptionist";
                  const isSelf = member.id === currentUserId;
                  return (
                    <tr key={member.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-white text-sm">{member.full_name}</div>
                        {member.specialization && member.role === "Trainer" && (
                          <div className="text-[11px] text-zinc-500">{member.specialization}</div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-200">
                          {member.login_id}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-zinc-300 font-mono text-xs">
                        {member.phone || "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                            isReception
                              ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                              : "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                          }`}
                        >
                          <IdentificationBadge weight="bold" className="w-3.5 h-3.5" />
                          <span>{member.role}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                            member.is_active ? "text-emerald-400" : "text-zinc-500"
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              member.is_active
                                ? "bg-emerald-400 shadow-sm shadow-emerald-400/50"
                                : "bg-zinc-600"
                            }`}
                          />
                          <span>{member.is_active ? "Active" : "Inactive"}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-zinc-500 text-xs font-mono">
                        {new Date(member.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(member)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors"
                            title="Edit Staff Member"
                          >
                            <PencilSimple className="w-3.5 h-3.5 text-lime-400" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => handleOpenDelete(member)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs font-semibold text-red-300 hover:bg-red-500/20 hover:text-red-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title={isSelf ? "Cannot delete yourself" : "Delete / Deactivate Staff"}
                          >
                            <Trash className="w-3.5 h-3.5 text-red-400" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: REGISTRATION FORM */}
      <AnimatePresence>
        {showRegisterModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowRegisterModal(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl relative"
            >
              <div className="flex justify-between items-start mb-5 pb-4 border-b border-zinc-800">
                <div>
                  <h3 className="text-xl font-black uppercase text-white tracking-tight flex items-center gap-2">
                    <UserPlus weight="bold" className="w-5 h-5 text-lime-400" />
                    <span>Register New Staff</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Create a new Receptionist or Trainer account. Credentials will be generated automatically.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <label className={LABEL}>Full Name *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="e.g. Bethlehem Tesfaye"
                    className={INPUT}
                  />
                </div>

                <div>
                  <label className={LABEL}>Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="e.g. 0911223344"
                    className={INPUT}
                  />
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Phone number is used for account lookup and verification.
                  </p>
                </div>

                <div>
                  <label className={LABEL}>Staff Role *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole("Receptionist")}
                      className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                        role === "Receptionist"
                          ? "border-cyan-400 bg-cyan-400/10 text-cyan-300 shadow-sm"
                          : "border-zinc-800 bg-zinc-800/50 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <IdentificationBadge weight="bold" className="w-4 h-4" />
                      <span>Receptionist</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRole("Trainer")}
                      className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                        role === "Trainer"
                          ? "border-purple-400 bg-purple-400/10 text-purple-300 shadow-sm"
                          : "border-zinc-800 bg-zinc-800/50 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <ShieldCheck weight="bold" className="w-4 h-4" />
                      <span>Trainer</span>
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800 flex gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-lime-400 text-zinc-950 font-bold py-3 rounded-xl hover:bg-lime-300 disabled:opacity-50 transition-colors uppercase text-xs flex items-center justify-center gap-2 shadow-lg shadow-lime-400/10"
                  >
                    <UserPlus weight="bold" className="w-4 h-4" />
                    <span>{isSubmitting ? "Creating Account..." : "Create Staff Account"}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setShowRegisterModal(false)}
                    className="flex-1 bg-zinc-800 text-zinc-300 font-semibold py-3 rounded-xl hover:bg-zinc-700 transition-colors text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL 2: EDIT STAFF MEMBER */}
      <AnimatePresence>
        {editingStaff && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEditingStaff(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl relative"
            >
              <div className="flex justify-between items-start mb-5 pb-4 border-b border-zinc-800">
                <div>
                  <h3 className="text-xl font-black uppercase text-white tracking-tight flex items-center gap-2">
                    <PencilSimple weight="bold" className="w-5 h-5 text-lime-400" />
                    <span>Edit Staff Member</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Update profile, contact details, and role for <span className="text-white font-semibold">{editingStaff.full_name}</span> ({editingStaff.login_id}).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-4">
                {/* Read-Only Account Identity Badges */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                      Login Identifier (Permanent)
                    </span>
                    <span className="font-mono text-sm font-bold text-lime-400">
                      {editingStaff.login_id}
                    </span>
                  </div>
                  {editingStaff.email && (
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                        Auth Email
                      </span>
                      <span className="font-mono text-xs text-zinc-300">
                        {editingStaff.email}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className={LABEL}>Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={e => setEditFullName(e.target.value)}
                    placeholder="Full name"
                    className={INPUT}
                  />
                </div>

                <div>
                  <label className={LABEL}>Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    placeholder="Phone number"
                    className={INPUT}
                  />
                </div>

                <div>
                  <label className={LABEL}>Staff Role *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setEditRole("Receptionist")}
                      className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                        editRole === "Receptionist"
                          ? "border-cyan-400 bg-cyan-400/10 text-cyan-300 shadow-sm"
                          : "border-zinc-800 bg-zinc-800/50 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <IdentificationBadge weight="bold" className="w-4 h-4" />
                      <span>Receptionist</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditRole("Trainer")}
                      className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                        editRole === "Trainer"
                          ? "border-purple-400 bg-purple-400/10 text-purple-300 shadow-sm"
                          : "border-zinc-800 bg-zinc-800/50 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <ShieldCheck weight="bold" className="w-4 h-4" />
                      <span>Trainer</span>
                    </button>
                  </div>
                </div>

                {editRole === "Trainer" && (
                  <div>
                    <label className={LABEL}>Specialization (Trainer)</label>
                    <input
                      type="text"
                      value={editSpecialization}
                      onChange={e => setEditSpecialization(e.target.value)}
                      placeholder="e.g. Strength, HIIT, Boxing, Yoga"
                      className={INPUT}
                    />
                  </div>
                )}

                <div>
                  <label className={LABEL}>Account Status</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setEditIsActive(true)}
                      className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        editIsActive
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                          : "border-zinc-800 bg-zinc-800/40 text-zinc-500 hover:border-zinc-700"
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      <span>Active (Login Enabled)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditIsActive(false)}
                      className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        !editIsActive
                          ? "border-amber-500 bg-amber-500/15 text-amber-300"
                          : "border-zinc-800 bg-zinc-800/40 text-zinc-500 hover:border-zinc-700"
                      }`}
                    >
                      <X className="w-4 h-4" />
                      <span>Inactive (Access Paused)</span>
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800 flex gap-3">
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="flex-1 bg-lime-400 text-zinc-950 font-bold py-3 rounded-xl hover:bg-lime-300 disabled:opacity-50 transition-colors uppercase text-xs flex items-center justify-center gap-2 shadow-lg shadow-lime-400/10"
                  >
                    <span>{isUpdating ? "Saving Changes..." : "Save Changes"}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => setEditingStaff(null)}
                    className="flex-1 bg-zinc-800 text-zinc-300 font-semibold py-3 rounded-xl hover:bg-zinc-700 transition-colors text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL 3: DELETE / DEACTIVATE CONFIRMATION */}
      <AnimatePresence>
        {deletingStaff && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDeletingStaff(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl relative space-y-4"
            >
              <div className="text-center space-y-2 pb-2">
                <div className="w-14 h-14 rounded-2xl bg-red-500/15 text-red-400 flex items-center justify-center mx-auto border border-red-500/30">
                  <WarningCircle weight="bold" className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-black uppercase text-white tracking-tight">
                  Delete / Deactivate Staff
                </h3>
                <p className="text-xs text-zinc-400">
                  Are you sure you want to remove access for this staff member?
                </p>
              </div>

              {/* Staff Member Card */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-2 text-sm">
                <div className="flex justify-between items-center pb-2 border-b border-zinc-800/70">
                  <span className="text-zinc-500 text-xs uppercase font-bold">Staff Member</span>
                  <span className="font-bold text-white">{deletingStaff.full_name}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-zinc-800/70">
                  <span className="text-zinc-500 text-xs uppercase font-bold">Login ID</span>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-zinc-900 text-zinc-200 border border-zinc-800">
                    {deletingStaff.login_id}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 text-xs uppercase font-bold">Role</span>
                  <span className="text-xs font-bold text-zinc-300">{deletingStaff.role}</span>
                </div>
              </div>

              {/* Data Integrity Explanation */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-amber-300">
                  <ShieldCheck weight="bold" className="w-4 h-4 shrink-0" />
                  <span>Audit & Data Integrity Protection</span>
                </p>
                <p className="text-[11px] leading-relaxed text-amber-200/90">
                  To ensure historical records (payments recorded, attendance check-ins, customer trainer assignments) remain valid, accounts with historical data are safely deactivated so login access is revoked while audit history is preserved.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl hover:bg-red-400 disabled:opacity-50 transition-colors uppercase text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                >
                  <Trash weight="bold" className="w-4 h-4" />
                  <span>{isDeleting ? "Processing..." : "Confirm Removal"}</span>
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeletingStaff(null)}
                  className="flex-1 bg-zinc-800 text-zinc-300 font-semibold py-3 rounded-xl hover:bg-zinc-700 transition-colors text-xs"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL 4: REGISTRATION CONFIRMATION WITH GENERATED CREDENTIALS */}
      <AnimatePresence>
        {createdCredentials && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl space-y-5"
            >
              <div className="text-center space-y-2 pb-4 border-b border-zinc-800">
                <div className="w-14 h-14 rounded-2xl bg-emerald-400/15 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-400/30">
                  <CheckCircle weight="fill" className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-white">Staff Account Created!</h3>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Please copy and securely share the generated credentials below with the staff member.
                </p>
              </div>

              {/* Credentials Summary Card */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 space-y-3.5">
                <div className="flex justify-between items-center text-xs pb-2 border-b border-zinc-800/60">
                  <span className="text-zinc-500 font-bold uppercase">Full Name</span>
                  <span className="font-bold text-white text-sm">{createdCredentials.fullName}</span>
                </div>

                <div className="flex justify-between items-center text-xs pb-2 border-b border-zinc-800/60">
                  <span className="text-zinc-500 font-bold uppercase">Role</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                      createdCredentials.role === "Receptionist"
                        ? "bg-cyan-500/20 text-cyan-300"
                        : "bg-purple-500/20 text-purple-300"
                    }`}
                  >
                    {createdCredentials.role}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs pb-2 border-b border-zinc-800/60">
                  <span className="text-zinc-500 font-bold uppercase">Phone Number</span>
                  <span className="font-mono text-zinc-300">{createdCredentials.phone}</span>
                </div>

                {/* Generated Login ID */}
                <div className="bg-zinc-900/90 border border-lime-400/30 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-lime-400 block">
                      Generated Login ID
                    </span>
                    <span className="text-lg font-mono font-black text-white">
                      {createdCredentials.loginId}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-400">Use on login screen</span>
                </div>

                {/* Temporary Password */}
                <div className="bg-zinc-900/90 border border-zinc-700 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                      Temporary Password
                    </span>
                    <span className="text-base font-mono font-black text-zinc-100">
                      {showPassword ? createdCredentials.tempPassword : "••••••••••••"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeSlash className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCopyCredentials}
                  className="flex-1 bg-lime-400 text-zinc-950 font-bold py-3.5 rounded-xl hover:bg-lime-300 transition-colors uppercase text-xs flex items-center justify-center gap-2 shadow-lg shadow-lime-400/10"
                >
                  <Copy weight="bold" className="w-4 h-4" />
                  <span>Copy Credentials</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreatedCredentials(null)}
                  className="bg-zinc-800 text-zinc-300 font-semibold py-3.5 px-6 rounded-xl hover:bg-zinc-700 transition-colors text-xs"
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
