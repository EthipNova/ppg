import { useMemo, useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChalkboardTeacher,
  Users,
  Clock,
  CheckCircle,
  WarningCircle,
  ArrowClockwise,
  IdentificationBadge,
  Sparkle,
  MagnifyingGlass,
  Warning,
} from "@phosphor-icons/react";
import { useGym } from "../context/GymContext";
import {
  fetchTrainerProfileData,
  type TrainerProfileState,
} from "../services/trainerProfileService";
import {
  fetchAssignedMembers,
  fetchTrainerDashboardOverview,
  type AssignedMemberItem,
  type TrainerDashboardOverviewResult,
} from "../services/personalTrainerService";
import CoachingCenter, { type CoachingSection } from "./CoachingCenter";
import { toast } from "sonner";

const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-6";

type PortalTab = "overview" | "members" | "coaching" | "profile";

const TAB_TO_SLUG: Record<PortalTab, string> = {
  overview: "dashboard",
  members: "members",
  coaching: "coaching",
  profile: "profile",
};

const SLUG_TO_TAB: Record<string, PortalTab> = {
  dashboard: "overview",
  overview: "overview",
  members: "members",
  coaching: "coaching",
  videos: "coaching",
  profile: "profile",
};

export default function TrainerPortal() {
  const { state } = useGym();
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const tab: PortalTab = (section && SLUG_TO_TAB[section.toLowerCase()]) || "overview";

  const handleTabChange = (nextTab: PortalTab) => {
    navigate(`/trainer/${TAB_TO_SLUG[nextTab]}`);
  };
  const [profileState, setProfileState] = useState<TrainerProfileState>({ status: "loading" });
  const [overview, setOverview] = useState<TrainerDashboardOverviewResult | null>(null);
  const [assignedMembers, setAssignedMembers] = useState<AssignedMemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Coaching Center state
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [coachingScope, setCoachingScope] = useState<"individual" | "all">("individual");
  const [coachingInitialSection, setCoachingInitialSection] = useState<CoachingSection>("videos");

  // Search filter for My Members tab
  const [memberSearch, setMemberSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "EXPIRED">("ALL");

  const currentUserId = state.currentUser?.id;

  const loadAllTrainerData = useCallback(async () => {
    if (!currentUserId) return;
    setError(null);

    try {
      // 1. Load Profile
      const profRes = await fetchTrainerProfileData(currentUserId);
      setProfileState(profRes);

      if (profRes.status !== "success") {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const trainerId = profRes.profile.id;

      // 2. Load Overview Metrics and Assigned Members in parallel
      const [overviewData, membersData] = await Promise.all([
        fetchTrainerDashboardOverview(trainerId),
        fetchAssignedMembers(trainerId),
      ]);

      setOverview(overviewData);
      setAssignedMembers(membersData);

      // Auto-select first member if none selected yet
      if (!selectedMemberId && membersData.length > 0) {
        setSelectedMemberId(membersData[0].customer_id);
      }
    } catch (err: unknown) {
      console.error("[TrainerPortal] Error loading trainer data:", err);
      setError((err as Error)?.message || "Failed to load trainer dashboard data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUserId, selectedMemberId]);

  useEffect(() => {
    void loadAllTrainerData();
  }, [loadAllTrainerData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllTrainerData();
    toast.success("Trainer dashboard refreshed.");
  };

  /**
   * Opens the centralized Coaching Center workspace, automatically selecting the member.
   */
  const handleOpenCoachingCenter = (memberId?: string, initialSection: CoachingSection = "workouts") => {
    if (memberId) {
      setSelectedMemberId(memberId);
      setCoachingScope("individual");
    } else {
      setCoachingScope("all");
    }
    setCoachingInitialSection(initialSection);
    handleTabChange("coaching");
  };

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return assignedMembers.filter(m => {
      const matchesSearch =
        !q ||
        m.customer_name.toLowerCase().includes(q) ||
        m.customer_code.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && m.membership_status === "ACTIVE") ||
        (statusFilter === "EXPIRED" && m.membership_status === "EXPIRED");

      return matchesSearch && matchesStatus;
    });
  }, [assignedMembers, memberSearch, statusFilter]);

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-lime-400/20 border-t-lime-400 rounded-full animate-spin mb-4" />
        <h2 className="text-base font-bold text-white">Loading Personal Trainer Portal...</h2>
        <p className="text-xs text-zinc-500 mt-1">Fetching your assigned member roster from Supabase</p>
      </div>
    );
  }

  // Error Screen
  if (error || profileState.status === "error") {
    const errorMsg = error || (profileState.status === "error" ? profileState.error : "Unknown error");
    return (
      <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center p-4">
        <div className={`${CARD} max-w-md w-full text-center space-y-4`}>
          <div className="w-12 h-12 rounded-full bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto text-red-400">
            <Warning weight="fill" className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-white">Trainer Portal Access Error</h3>
          <p className="text-xs text-zinc-400">{errorMsg}</p>
          <button
            onClick={loadAllTrainerData}
            className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-colors inline-flex items-center gap-2"
          >
            <ArrowClockwise weight="bold" className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const trainerProfile = profileState.status === "success" ? profileState.profile : null;

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-lime-400/10 border border-lime-400/30 flex items-center justify-center text-lime-400 shrink-0">
              <ChalkboardTeacher weight="fill" className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black uppercase tracking-tight">
                  Coach {trainerProfile?.fullName || state.currentUser?.name || "Trainer"}
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-lime-400/20 text-lime-400 border border-lime-400/30">
                  {trainerProfile?.specialization || "Personal Trainer"}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Centralized coaching workspace: exercise videos, workout plans, nutrition, attendance, and member progress.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenCoachingCenter()}
              className="bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors"
            >
              <ChalkboardTeacher weight="bold" className="w-4 h-4 text-lime-400" />
              Open Coaching Center
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 border border-zinc-700 transition-colors"
              title="Refresh Data"
            >
              <ArrowClockwise
                weight="bold"
                className={`w-4 h-4 ${refreshing ? "animate-spin text-lime-400" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown (<640px) */}
        <div className="block sm:hidden">
          <label htmlFor="trainer-portal-tab-select" className="sr-only">Select trainer workspace section</label>
          <select
            id="trainer-portal-tab-select"
            value={tab}
            onChange={(e) => handleTabChange(e.target.value as PortalTab)}
            className="w-full min-h-[44px] bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-lime-400 transition-colors"
          >
            <option value="overview">Dashboard Overview</option>
            <option value="members">My Members ({assignedMembers.length})</option>
            <option value="coaching">Coaching Center</option>
            <option value="profile">Trainer Profile</option>
          </select>
        </div>

        {/* Desktop Navigation Tabs (>=640px) */}
        <div className="hidden sm:flex gap-2 border-b border-zinc-800/80 pb-3 overflow-x-auto">
          <button
            onClick={() => handleTabChange("overview")}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
              tab === "overview"
                ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
                : "bg-zinc-800/60 text-zinc-400 hover:text-white"
            }`}
          >
            <Sparkle weight="bold" className="w-4 h-4 shrink-0" />
            Dashboard Overview
          </button>
          <button
            onClick={() => handleTabChange("members")}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
              tab === "members"
                ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
                : "bg-zinc-800/60 text-zinc-400 hover:text-white"
            }`}
          >
            <Users weight="bold" className="w-4 h-4 shrink-0" />
            My Members ({assignedMembers.length})
          </button>
          <button
            onClick={() => handleTabChange("coaching")}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
              tab === "coaching"
                ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
                : "bg-zinc-800/60 text-zinc-400 hover:text-white"
            }`}
          >
            <ChalkboardTeacher weight="bold" className="w-4 h-4 shrink-0" />
            Coaching Center
          </button>
          <button
            onClick={() => handleTabChange("profile")}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
              tab === "profile"
                ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
                : "bg-zinc-800/60 text-zinc-400 hover:text-white"
            }`}
          >
            <IdentificationBadge weight="bold" className="w-4 h-4 shrink-0" />
            Trainer Profile
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* KPI Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className={CARD}>
                <div className="flex items-center justify-between text-zinc-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Assigned</span>
                  <Users weight="bold" className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-black text-white">
                  {overview?.total_assigned ?? assignedMembers.length}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Total personal training clients</p>
              </div>

              <div className={CARD}>
                <div className="flex items-center justify-between text-zinc-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Active Members</span>
                  <CheckCircle weight="fill" className="w-4 h-4 text-lime-400" />
                </div>
                <div className="text-2xl font-black text-lime-400">
                  {overview?.active_members ?? assignedMembers.filter(m => m.membership_status === "ACTIVE").length}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Valid gym membership</p>
              </div>

              <div className={CARD}>
                <div className="flex items-center justify-between text-zinc-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Expired Members</span>
                  <WarningCircle weight="bold" className="w-4 h-4 text-red-400" />
                </div>
                <div className="text-2xl font-black text-red-400">
                  {overview?.expired_members ?? assignedMembers.filter(m => m.membership_status === "EXPIRED").length}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Need membership renewal</p>
              </div>

              <div className={CARD}>
                <div className="flex items-center justify-between text-zinc-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Follow-up Needed</span>
                  <Clock weight="bold" className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-black text-amber-400">
                  {overview?.follow_up_needed ?? 0}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">No session in last 7 days</p>
              </div>
            </div>

            {/* Quick Member Overview & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Member Quick Roster (2 cols) */}
              <div className={`${CARD} lg:col-span-2 space-y-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Users weight="fill" className="w-5 h-5 text-lime-400" />
                      Assigned Member Roster
                    </h3>
                    <p className="text-xs text-zinc-400">Select any member to open their coaching workspace</p>
                  </div>
                  <button
                    onClick={() => handleTabChange("members")}
                    className="text-xs text-lime-400 hover:underline font-semibold"
                  >
                    View All &rarr;
                  </button>
                </div>

                {assignedMembers.length === 0 ? (
                  <div className="py-12 text-center text-zinc-500">
                    <Users className="w-12 h-12 mx-auto text-zinc-700 mb-2" />
                    <p className="text-sm font-semibold text-zinc-400">No members currently assigned</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      When Reception registers new members with Personal Training and assigns them to you, they will appear here automatically.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assignedMembers.slice(0, 5).map(m => (
                      <div
                        key={m.id}
                        onClick={() => handleOpenCoachingCenter(m.customer_id)}
                        className="p-3.5 bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-800 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-lime-400/10 border border-lime-400/20 flex items-center justify-center font-bold text-xs text-lime-400">
                            {m.customer_name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-white group-hover:text-lime-400 transition-colors">
                              {m.customer_name}
                            </div>
                            <div className="text-[11px] text-zinc-400 flex items-center gap-2">
                              <span>Code: {m.customer_code}</span>
                              <span>·</span>
                              <span>{m.plan_name || m.category}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.membership_status === "ACTIVE"
                                ? "bg-lime-400/15 text-lime-400 border border-lime-400/30"
                                : "bg-red-400/15 text-red-400 border border-red-400/30"
                            }`}
                          >
                            {m.membership_status || "ACTIVE"}
                          </span>
                          <span className="text-xs text-zinc-500 group-hover:text-white font-semibold">
                            Coach &rarr;
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Member Activity (1 col) */}
              <div className={`${CARD} space-y-4`}>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Clock weight="fill" className="w-5 h-5 text-lime-400" />
                  Recent Member Activity
                </h3>
                <p className="text-xs text-zinc-400">Gym check-ins and completed 1-on-1 sessions</p>

                {overview?.recentActivity && overview.recentActivity.length > 0 ? (
                  <div className="space-y-3">
                    {overview.recentActivity.slice(0, 6).map((act, i) => (
                      <div
                        key={i}
                        className="text-xs p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white">{act.customerName}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                              act.activityType === "PT_SESSION"
                                ? "bg-purple-400/20 text-purple-300 border border-purple-400/30"
                                : "bg-blue-400/20 text-blue-300 border border-blue-400/30"
                            }`}
                          >
                            {act.activityType === "PT_SESSION" ? "PT Session" : "Gym Visit"}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400">{act.details}</p>
                        <p className="text-[10px] text-zinc-500">
                          {new Date(act.activityTimestamp).toLocaleDateString()} at{" "}
                          {new Date(act.activityTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-zinc-500 text-xs">
                    No recent session or gym check-in activity recorded yet for your assigned members.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MY MEMBERS */}
        {tab === "members" && (
          <div className={`${CARD} space-y-5`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users weight="fill" className="w-5 h-5 text-lime-400" />
                  My Assigned Members
                </h3>
                <p className="text-xs text-zinc-400">
                  Members registered with personal training under your supervision. Trainers access only their assigned members.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-52 sm:w-64">
                  <MagnifyingGlass className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search name, phone, code..."
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-lime-400/50"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "EXPIRED")}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="ALL">All Status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="EXPIRED">Expired</option>
                </select>
              </div>
            </div>

            {filteredMembers.length === 0 ? (
              <div className="py-16 text-center text-zinc-500">
                <Users className="w-12 h-12 mx-auto text-zinc-700 mb-2" />
                <p className="text-sm font-semibold text-zinc-400">No matching assigned members</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Adjust your search filter or check back once Reception assigns new members.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px]">
                      <th className="pb-3 pl-2">Member</th>
                      <th className="pb-3">Code</th>
                      <th className="pb-3">Phone</th>
                      <th className="pb-3">Category</th>
                      <th className="pb-3">Plan</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Valid Until</th>
                      <th className="pb-3">Assigned Date</th>
                      <th className="pb-3 text-right pr-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredMembers.map(m => (
                      <tr key={m.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3.5 pl-2 font-semibold text-white">
                          {m.customer_name}
                        </td>
                        <td className="py-3.5 text-zinc-400 font-mono text-[11px]">
                          {m.customer_code}
                        </td>
                        <td className="py-3.5 text-zinc-400">{m.phone}</td>
                        <td className="py-3.5">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-semibold">
                            {m.category}
                          </span>
                        </td>
                        <td className="py-3.5 text-zinc-300">{m.plan_name || "—"}</td>
                        <td className="py-3.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              m.membership_status === "ACTIVE"
                                ? "bg-lime-400/15 text-lime-400 border border-lime-400/30"
                                : "bg-red-400/15 text-red-400 border border-red-400/30"
                            }`}
                          >
                            {m.membership_status || "ACTIVE"}
                          </span>
                        </td>
                        <td className="py-3.5 text-zinc-300 font-mono text-[11px]">
                          {m.membership_end_date
                            ? new Date(m.membership_end_date).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="py-3.5 text-zinc-400">
                          {new Date(m.assigned_at).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 text-right pr-2">
                          <button
                            onClick={() => handleOpenCoachingCenter(m.customer_id)}
                            className="bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors"
                          >
                            Open Coaching Suite
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CENTRALIZED COACHING CENTER (Replaces Exercise Videos & Multi-Page Suite) */}
        {tab === "coaching" && (
          <CoachingCenter
            trainerProfile={trainerProfile}
            assignedMembers={assignedMembers}
            selectedMemberId={selectedMemberId}
            onSelectMemberId={setSelectedMemberId}
            scope={coachingScope}
            onScopeChange={setCoachingScope}
            initialSection={coachingInitialSection}
            onRefreshData={loadAllTrainerData}
            onNavigateToMembers={() => handleTabChange("members")}
          />
        )}

        {/* TAB 4: TRAINER PROFILE */}
        {tab === "profile" && (
          <div className="space-y-6 max-w-2xl">
            <div className={`${CARD} space-y-4`}>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-lime-400/10 border border-lime-400/30 flex items-center justify-center font-black text-2xl text-lime-400">
                  {trainerProfile?.fullName?.charAt(0) || "T"}
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">{trainerProfile?.fullName}</h3>
                  <p className="text-xs text-lime-400 font-semibold">{trainerProfile?.specialization || "Personal Trainer"}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">PowerPlus Gym Certified Coach</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-800 text-xs text-zinc-400">
                <div>
                  <span className="text-zinc-500 block">Phone</span>
                  <span className="font-semibold text-white">{trainerProfile?.phone || "—"}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Login ID</span>
                  <span className="font-semibold text-white font-mono">
                    {state.currentUser?.name || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Active Status</span>
                  <span className="font-semibold text-lime-400">
                    {trainerProfile?.isActive ? "Active on Roster" : "Inactive"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Assigned Clients</span>
                  <span className="font-semibold text-white">{assignedMembers.length} members</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
