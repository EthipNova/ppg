import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Users,
  User,
  VideoCamera,
  Barbell,
  ForkKnife,
  CalendarCheck,
  TrendUp,
  Plus,
  Play,
  Trash,
  PencilSimple,
  X,
  Check,
  MagnifyingGlass,
  ArrowClockwise,
  UploadSimple,
  Sparkle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  fetchMemberWorkoutPlans,
  fetchTrainerWorkoutPlans,
  deleteWorkoutPlan,
  updateWorkoutPlan,
  distributeWorkoutPlan,
  fetchMemberMealPlans,
  fetchTrainerMealPlans,
  deleteMealPlan,
  updateMealPlan,
  distributeMealPlan,
  fetchTrainerExerciseVideos,
  deleteExerciseVideo,
  distributeExerciseVideo,
  getExerciseVideoSignedUrl,
  fetchMemberAttendanceHistory,
  fetchTrainerPTSessions,
  recordPersonalTrainingSession,
  fetchMemberProgressRecords,
  fetchTrainerMemberProgress,
  recordMemberProgress,
  deleteMemberProgressRecord,
  type AssignedMemberItem,
  type WorkoutPlanWithExercises,
  type MealPlanWithItems,
  type ExerciseVideo,
  type MemberProgressRecord,
  type MemberAttendanceCombinedItem,
  type PersonalTrainingSessionItem,
} from "../services/personalTrainerService";
import type { RealTrainerProfile } from "../services/trainerProfileService";

const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-5";
const INPUT =
  "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50 transition-colors text-xs";
const LABEL = "block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1";

export type CoachingSection = "videos" | "workouts" | "meals" | "attendance" | "progress";

// Predefined Workout Templates for 4-field structure
const WORKOUT_TEMPLATES = [
  {
    name: "Full Body Hypertrophy",
    entries: [
      { exerciseName: "Barbell Squats", dayOfWeek: "Monday", sets: 4, reps: 12 },
      { exerciseName: "Dumbbell Bench Press", dayOfWeek: "Monday", sets: 4, reps: 12 },
      { exerciseName: "Seated Cable Rows", dayOfWeek: "Wednesday", sets: 3, reps: 12 },
      { exerciseName: "Romanian Deadlifts", dayOfWeek: "Wednesday", sets: 3, reps: 10 },
      { exerciseName: "Standing Overhead Press", dayOfWeek: "Friday", sets: 3, reps: 12 },
      { exerciseName: "Hanging Leg Raises", dayOfWeek: "Friday", sets: 3, reps: 15 },
    ],
  },
  {
    name: "Strength & Power (3-Day Split)",
    entries: [
      { exerciseName: "Barbell Back Squats", dayOfWeek: "Monday", sets: 5, reps: 5 },
      { exerciseName: "Barbell Bench Press", dayOfWeek: "Monday", sets: 5, reps: 5 },
      { exerciseName: "Conventional Deadlift", dayOfWeek: "Wednesday", sets: 4, reps: 5 },
      { exerciseName: "Military Shoulder Press", dayOfWeek: "Wednesday", sets: 4, reps: 6 },
      { exerciseName: "Barbell Pendlay Rows", dayOfWeek: "Friday", sets: 4, reps: 8 },
      { exerciseName: "Weighted Dips", dayOfWeek: "Friday", sets: 3, reps: 8 },
    ],
  },
  {
    name: "Fat Loss & Conditioning Circuit",
    entries: [
      { exerciseName: "Kettlebell Swings", dayOfWeek: "Tuesday", sets: 4, reps: 20 },
      { exerciseName: "Goblet Squats", dayOfWeek: "Tuesday", sets: 4, reps: 15 },
      { exerciseName: "Push-ups to Renegade Row", dayOfWeek: "Thursday", sets: 3, reps: 12 },
      { exerciseName: "Assault Bike Intervals", dayOfWeek: "Thursday", sets: 5, reps: 10 },
      { exerciseName: "Plank Hold", dayOfWeek: "Saturday", sets: 3, reps: 1 },
    ],
  },
];

// Predefined Meal Plan Templates
const MEAL_TEMPLATES = [
  {
    name: "High Protein Muscle Building",
    dailyCalories: 2600,
    notes: "Drink at least 3 liters of water daily. High biological value protein with complex carbs.",
    items: [
      { mealType: "BREAKFAST", foodName: "Scrambled Eggs (4) + Oats with Banana & Honey", portion: "4 whole eggs, 80g oats", instructions: "Cook with minimal olive oil" },
      { mealType: "LUNCH", foodName: "Grilled Chicken Breast with Brown Rice & Steamed Veggies", portion: "200g chicken, 150g rice", instructions: "Season with garlic and lemon" },
      { mealType: "SNACK", foodName: "Greek Yogurt or Whey Shake + Almonds", portion: "1 scoop / 200g yogurt, 30g nuts", instructions: "Post-workout or mid-afternoon" },
      { mealType: "DINNER", foodName: "Tender Beef or Tilapia with Sweet Potato & Salad", portion: "200g fish/beef, 200g sweet potato", instructions: "Olive oil and vinegar dressing" },
    ],
  },
  {
    name: "Calorie Deficit & Fat Loss",
    dailyCalories: 1800,
    notes: "Prioritize lean protein and high fiber vegetables to maintain fullness during deficit.",
    items: [
      { mealType: "BREAKFAST", foodName: "Egg Whites (3) + 1 Whole Egg + Spinach & Toast", portion: "3 whites, 1 egg, 1 slice toast", instructions: "Saute spinach in dry pan" },
      { mealType: "LUNCH", foodName: "Grilled Chicken Salad with Avocado & Lemon Dressing", portion: "180g chicken, 1/4 avocado", instructions: "No mayonnaise or creamy dressing" },
      { mealType: "SNACK", foodName: "Apple with Natural Peanut Butter", portion: "1 medium apple, 15g peanut butter", instructions: "Stay hydrated with green tea" },
      { mealType: "DINNER", foodName: "Baked White Fish with Roasted Broccoli & Cauliflower", portion: "220g fish, 200g vegetables", instructions: "Season with paprika and pepper" },
    ],
  },
];

interface CoachingCenterProps {
  trainerProfile: RealTrainerProfile | null;
  assignedMembers: AssignedMemberItem[];
  selectedMemberId: string | null;
  onSelectMemberId: (id: string | null) => void;
  scope: "individual" | "all";
  onScopeChange: (scope: "individual" | "all") => void;
  initialSection?: CoachingSection;
  onRefreshData?: () => Promise<void>;
  onNavigateToMembers?: () => void;
}

export default function CoachingCenter({
  trainerProfile,
  assignedMembers,
  selectedMemberId,
  onSelectMemberId,
  scope,
  onScopeChange,
  initialSection = "videos",
  onRefreshData,
  onNavigateToMembers,
}: CoachingCenterProps) {
  const [section, setSection] = useState<CoachingSection>(initialSection);

  // Data states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [videos, setVideos] = useState<ExerciseVideo[]>([]);
  const [workoutPlans, setWorkoutPlans] = useState<WorkoutPlanWithExercises[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlanWithItems[]>([]);
  const [attendance, setAttendance] = useState<MemberAttendanceCombinedItem[]>([]);
  const [ptSessionsAll, setPtSessionsAll] = useState<PersonalTrainingSessionItem[]>([]);
  const [progressRecords, setProgressRecords] = useState<MemberProgressRecord[]>([]);

  // Modals
  const [showVideoUploadModal, setShowVideoUploadModal] = useState(false);
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [editingWorkoutPlan, setEditingWorkoutPlan] = useState<WorkoutPlanWithExercises | null>(null);
  const [showMealModal, setShowMealModal] = useState(false);
  const [editingMealPlan, setEditingMealPlan] = useState<MealPlanWithItems | null>(null);
  const [showRecordSessionModal, setShowRecordSessionModal] = useState(false);
  const [showRecordProgressModal, setShowRecordProgressModal] = useState(false);

  // Video Streaming Player
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  const [playingVideoTitle, setPlayingVideoTitle] = useState("");

  // Search in member selector
  const [memberSearchQuery, setMemberSearchQuery] = useState("");

  // Video list filter
  const [videoFilterQuery, setVideoFilterQuery] = useState("");

  const effectiveTrainerId = trainerProfile?.id;

  // Selected Member Object
  const currentMember = useMemo(() => {
    if (!selectedMemberId) return null;
    return assignedMembers.find(m => m.customer_id === selectedMemberId || m.id === selectedMemberId) || null;
  }, [assignedMembers, selectedMemberId]);

  // Load Section Data
  const loadCoachingData = useCallback(async () => {
    if (!effectiveTrainerId) return;
    setLoading(true);

    try {
      // 1. Always load trainer's exercise videos
      const vids = await fetchTrainerExerciseVideos(effectiveTrainerId);
      setVideos(vids);

      if (scope === "individual" && selectedMemberId) {
        // Individual member focus
        const [w, m, att, prog] = await Promise.all([
          fetchMemberWorkoutPlans(selectedMemberId).catch(() => []),
          fetchMemberMealPlans(selectedMemberId).catch(() => []),
          fetchMemberAttendanceHistory(selectedMemberId).catch(() => []),
          fetchMemberProgressRecords(selectedMemberId).catch(() => []),
        ]);
        setWorkoutPlans(w);
        setMealPlans(m);
        setAttendance(att);
        setProgressRecords(prog);
      } else {
        // All members focus
        const [w, m, ptSessions, prog] = await Promise.all([
          fetchTrainerWorkoutPlans(effectiveTrainerId).catch(() => []),
          fetchTrainerMealPlans(effectiveTrainerId).catch(() => []),
          fetchTrainerPTSessions(effectiveTrainerId).catch(() => []),
          fetchTrainerMemberProgress(effectiveTrainerId).catch(() => []),
        ]);
        setWorkoutPlans(w);
        setMealPlans(m);
        setPtSessionsAll(ptSessions);
        setProgressRecords(prog);
      }
    } catch (err: unknown) {
      console.error("[CoachingCenter] Error loading coaching data:", err);
      toast.error((err as Error)?.message || "Failed to load coaching data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [effectiveTrainerId, scope, selectedMemberId]);

  useEffect(() => {
    void loadCoachingData();
  }, [loadCoachingData]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadCoachingData();
    if (onRefreshData) await onRefreshData();
    toast.success("Coaching Center updated.");
  };

  // Switch to individual member
  const handleSelectMember = (memberId: string) => {
    onSelectMemberId(memberId);
    onScopeChange("individual");
  };

  // Switch to all members
  const handleSelectAllMembers = () => {
    onScopeChange("all");
  };

  // Video Playing
  const handlePlayVideo = async (video: ExerciseVideo) => {
    try {
      const signedUrl = await getExerciseVideoSignedUrl(video.storagePath);
      setPlayingVideoUrl(signedUrl);
      setPlayingVideoTitle(video.title);
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to generate video stream URL.");
    }
  };

  // Video Deletion
  const handleDeleteVideo = async (video: ExerciseVideo) => {
    if (!confirm(`Are you sure you want to delete video "${video.title}"?`)) return;
    try {
      await deleteExerciseVideo(video.id, video.storagePath);
      toast.success("Exercise video removed.");
      setVideos(prev => prev.filter(v => v.id !== video.id));
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to delete video.");
    }
  };

  // Workout Plan Deletion
  const handleDeleteWorkoutPlan = async (plan: WorkoutPlanWithExercises) => {
    if (!confirm(`Are you sure you want to delete workout plan "${plan.title}"?`)) return;
    try {
      await deleteWorkoutPlan(plan.id);
      toast.success("Workout plan deleted.");
      setWorkoutPlans(prev => prev.filter(p => p.id !== plan.id));
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to delete workout plan.");
    }
  };

  // Meal Plan Deletion
  const handleDeleteMealPlan = async (plan: MealPlanWithItems) => {
    if (!confirm(`Are you sure you want to delete meal plan "${plan.title}"?`)) return;
    try {
      await deleteMealPlan(plan.id);
      toast.success("Meal plan deleted.");
      setMealPlans(prev => prev.filter(p => p.id !== plan.id));
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to delete meal plan.");
    }
  };

  // Progress Record Deletion
  const handleDeleteProgressRecord = async (recordId: string) => {
    if (!confirm("Delete this progress record?")) return;
    try {
      await deleteMemberProgressRecord(recordId);
      toast.success("Progress record deleted.");
      setProgressRecords(prev => prev.filter(r => r.id !== recordId));
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to delete progress record.");
    }
  };

  // Filtered members for dropdown search
  const filteredDropdownMembers = useMemo(() => {
    const q = memberSearchQuery.trim().toLowerCase();
    if (!q) return assignedMembers;
    return assignedMembers.filter(
      m =>
        m.customer_name.toLowerCase().includes(q) ||
        m.customer_code.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q)
    );
  }, [assignedMembers, memberSearchQuery]);

  // Filtered Videos
  const filteredVideos = useMemo(() => {
    let list = videos;
    // In individual mode, only show videos assigned to this member OR broadcast to all (customer_id is null)
    if (scope === "individual" && selectedMemberId) {
      list = list.filter(v => !v.customerId || v.customerId === selectedMemberId);
    }
    const q = videoFilterQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(v => v.title.toLowerCase().includes(q) || (v.description && v.description.toLowerCase().includes(q)));
  }, [videos, scope, selectedMemberId, videoFilterQuery]);

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & MEMBER SELECTION CONTROL */}
      <div className={`${CARD} space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Sparkle weight="fill" className="w-5 h-5 text-lime-400" />
              Centralized Coaching Center
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Manage exercise videos, workout routines, meal plans, attendance, and member progress from one unified workspace.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors flex items-center gap-1.5 text-xs font-semibold"
              title="Refresh Workspace"
            >
              <ArrowClockwise
                weight="bold"
                className={`w-4 h-4 ${refreshing ? "animate-spin text-lime-400" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Mode Selector Toggle: Individual vs All Members */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800">
          <div className="flex items-center gap-1.5 p-1 bg-zinc-950 rounded-xl border border-zinc-800/80">
            <button
              onClick={() => {
                onScopeChange("individual");
                if (!selectedMemberId && assignedMembers.length > 0) {
                  onSelectMemberId(assignedMembers[0].customer_id);
                }
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                scope === "individual"
                  ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <User weight="bold" className="w-4 h-4" />
              Individual Member
            </button>

            <button
              onClick={handleSelectAllMembers}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                scope === "all"
                  ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Users weight="bold" className="w-4 h-4" />
              All My Members ({assignedMembers.length})
            </button>
          </div>

          {/* Member Search / Selector Dropdown when in Individual Mode */}
          {scope === "individual" && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400 font-semibold whitespace-nowrap">Select Member:</label>
              {assignedMembers.length > 5 && (
                <input
                  type="text"
                  placeholder="Filter..."
                  value={memberSearchQuery}
                  onChange={e => setMemberSearchQuery(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-2.5 py-1 text-xs focus:outline-none focus:border-lime-400/60 w-28 sm:w-36"
                />
              )}
              <select
                value={selectedMemberId || ""}
                onChange={e => handleSelectMember(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-lime-400/60 max-w-xs"
              >
                {filteredDropdownMembers.length === 0 ? (
                  <option value="">{assignedMembers.length === 0 ? "No members assigned" : "No matches found"}</option>
                ) : (
                  filteredDropdownMembers.map(m => (
                    <option key={m.id} value={m.customer_id}>
                      {m.customer_name} ({m.customer_code})
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
        </div>

        {/* Empty Assigned Members State */}
        {assignedMembers.length === 0 && (
          <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-xs text-zinc-400">
              You do not have any assigned members yet.
            </p>
            {onNavigateToMembers && (
              <button
                onClick={onNavigateToMembers}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-lime-400 font-semibold transition-colors"
              >
                Go to My Members
              </button>
            )}
          </div>
        )}

        {/* Selected Member Detail Summary OR Group Banner */}
        {scope === "individual" && currentMember ? (
          <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-lime-400/10 border border-lime-400/30 flex items-center justify-center font-black text-lime-400 text-base shrink-0">
                {currentMember.customer_name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-base">{currentMember.customer_name}</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300">
                    {currentMember.customer_code}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      currentMember.membership_status === "ACTIVE"
                        ? "bg-lime-400/15 text-lime-400 border border-lime-400/30"
                        : "bg-red-400/15 text-red-400 border border-red-400/30"
                    }`}
                  >
                    {currentMember.membership_status || "ACTIVE"}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5 flex flex-wrap items-center gap-2">
                  <span>Phone: <strong className="text-zinc-200">{currentMember.phone}</strong></span>
                  <span>·</span>
                  <span>Plan: <strong className="text-zinc-200">{currentMember.plan_name || currentMember.category}</strong></span>
                  <span>·</span>
                  <span>Assigned: <strong className="text-zinc-200">{new Date(currentMember.assigned_at).toLocaleDateString()}</strong></span>
                </p>
              </div>
            </div>

            <div className="text-right text-xs text-zinc-500 self-end md:self-auto">
              <span>Managing 1-on-1 coaching content for this member</span>
            </div>
          </div>
        ) : scope === "all" ? (
          <div className="p-4 bg-lime-400/5 border border-lime-400/20 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-lime-400/15 border border-lime-400/30 flex items-center justify-center text-lime-400 shrink-0">
                <Users weight="fill" className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-white text-sm">Group Distribution Workspace</h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-lime-400/20 text-lime-400">
                    {assignedMembers.length} Active Clients
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Content created or published in this mode will be assigned to every eligible member under your supervision.
                </p>
              </div>
            </div>

            {assignedMembers.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {assignedMembers.slice(0, 4).map(m => (
                  <span
                    key={m.id}
                    onClick={() => handleSelectMember(m.customer_id)}
                    className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium border border-zinc-700 cursor-pointer transition-colors"
                    title={`Click to focus on ${m.customer_name}`}
                  >
                    {m.customer_name}
                  </span>
                ))}
                {assignedMembers.length > 4 && (
                  <span className="text-[11px] text-zinc-500 font-semibold">
                    +{assignedMembers.length - 4} more
                  </span>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* 2. SECTION SUB-TABS NAVIGATION */}
      {/* Mobile Section Dropdown (<640px) */}
      <div className="block sm:hidden">
        <label htmlFor="coaching-section-select" className="sr-only">Select coaching workspace section</label>
        <select
          id="coaching-section-select"
          value={section}
          onChange={(e) => setSection(e.target.value as CoachingSection)}
          className="w-full min-h-[44px] bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-lime-400 transition-colors"
        >
          <option value="videos">Exercise Videos ({filteredVideos.length})</option>
          <option value="workouts">Workout Plans ({workoutPlans.length})</option>
          <option value="meals">Meal Plans ({mealPlans.length})</option>
          <option value="attendance">Attendance & PT Sessions ({scope === "individual" ? attendance.length : ptSessionsAll.length})</option>
          <option value="progress">Progress Records ({progressRecords.length})</option>
        </select>
      </div>

      {/* Desktop Section Tabs (>=640px) */}
      <div className="hidden sm:flex gap-2 border-b border-zinc-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setSection("videos")}
          className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
            section === "videos"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
              : "bg-zinc-800/60 text-zinc-400 hover:text-white"
          }`}
        >
          <VideoCamera weight="bold" className="w-4 h-4 shrink-0" />
          Exercise Videos ({filteredVideos.length})
        </button>

        <button
          onClick={() => setSection("workouts")}
          className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
            section === "workouts"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
              : "bg-zinc-800/60 text-zinc-400 hover:text-white"
          }`}
        >
          <Barbell weight="bold" className="w-4 h-4 shrink-0" />
          Workout Plans ({workoutPlans.length})
        </button>

        <button
          onClick={() => setSection("meals")}
          className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
            section === "meals"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
              : "bg-zinc-800/60 text-zinc-400 hover:text-white"
          }`}
        >
          <ForkKnife weight="bold" className="w-4 h-4 shrink-0" />
          Meal Plans ({mealPlans.length})
        </button>

        <button
          onClick={() => setSection("attendance")}
          className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
            section === "attendance"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
              : "bg-zinc-800/60 text-zinc-400 hover:text-white"
          }`}
        >
          <CalendarCheck weight="bold" className="w-4 h-4 shrink-0" />
          Attendance & PT Sessions ({scope === "individual" ? attendance.length : ptSessionsAll.length})
        </button>

        <button
          onClick={() => setSection("progress")}
          className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
            section === "progress"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
              : "bg-zinc-800/60 text-zinc-400 hover:text-white"
          }`}
        >
          <TrendUp weight="bold" className="w-4 h-4 shrink-0" />
          Progress Records ({progressRecords.length})
        </button>
      </div>

      {/* 3. SECTION CONTENT */}
      {loading ? (
        <div className={`${CARD} py-16 text-center text-zinc-500`}>
          <div className="w-8 h-8 border-2 border-lime-400/20 border-t-lime-400 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs">Loading coaching workspace...</p>
        </div>
      ) : (
        <>
          {/* SECTION 1: EXERCISE VIDEOS */}
          {section === "videos" && (
            <div className="space-y-4">
              <div className={`${CARD} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <VideoCamera weight="fill" className="w-5 h-5 text-lime-400" />
                    Exercise Demonstration Videos
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Upload demonstration videos to guide form. Videos are safely streamable by assigned members in their My Trainer portal.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-44 sm:w-56">
                    <MagnifyingGlass className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search videos..."
                      value={videoFilterQuery}
                      onChange={e => setVideoFilterQuery(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none"
                    />
                  </div>

                  <button
                    onClick={() => setShowVideoUploadModal(true)}
                    className="bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Plus weight="bold" className="w-3.5 h-3.5" />
                    Upload & Distribute Video
                  </button>
                </div>
              </div>

              {filteredVideos.length === 0 ? (
                <div className={`${CARD} py-14 text-center text-zinc-500`}>
                  <VideoCamera className="w-12 h-12 mx-auto text-zinc-700 mb-2" />
                  <p className="text-sm font-semibold text-zinc-400">No exercise videos found</p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                    Upload MP4/WebM videos to demonstrate exercise techniques for your members.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredVideos.map(vid => (
                    <div
                      key={vid.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-zinc-700 transition-colors"
                    >
                      <div>
                        {/* Video Thumbnail with Play Button */}
                        <div
                          onClick={() => handlePlayVideo(vid)}
                          className="w-full h-36 bg-zinc-800/60 rounded-xl flex items-center justify-center relative overflow-hidden group cursor-pointer border border-zinc-800"
                        >
                          <div className="w-11 h-11 rounded-full bg-lime-400/90 group-hover:bg-lime-400 text-zinc-950 flex items-center justify-center transition-transform group-hover:scale-110 shadow-lg">
                            <Play weight="fill" className="w-5 h-5 ml-0.5" />
                          </div>
                          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-[10px] text-zinc-300 font-mono">
                            {vid.fileSizeBytes ? `${(vid.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB` : "Video"}
                          </span>
                        </div>

                        <h4 className="font-bold text-white text-sm mt-3">{vid.title}</h4>
                        {vid.description && (
                          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{vid.description}</p>
                        )}
                      </div>

                      <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                        {/* Recipient Badge */}
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-500">Recipient:</span>
                          {vid.customerName ? (
                            <span className="font-semibold text-lime-400 truncate max-w-[170px]" title={vid.customerName}>
                              👤 {vid.customerName} {vid.customerCode ? `(${vid.customerCode})` : ""}
                            </span>
                          ) : (
                            <span className="font-semibold text-purple-300 bg-purple-400/15 border border-purple-400/30 px-2 py-0.5 rounded text-[10px]">
                              👥 All Assigned Members
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>{new Date(vid.createdAt).toLocaleDateString()}</span>
                          <button
                            onClick={() => handleDeleteVideo(vid)}
                            className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-zinc-800 transition-colors"
                            title="Delete video"
                          >
                            <Trash weight="bold" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: WORKOUT PLANS */}
          {section === "workouts" && (
            <div className="space-y-4">
              <div className={`${CARD} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Barbell weight="fill" className="w-5 h-5 text-lime-400" />
                    Workout Plans
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Simplified workout structure: Workout Name, Workout Day, Sets, and Repetitions.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setEditingWorkoutPlan(null);
                    setShowWorkoutModal(true);
                  }}
                  className="bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-colors self-start sm:self-auto"
                >
                  <Plus weight="bold" className="w-3.5 h-3.5" />
                  Create Workout Plan
                </button>
              </div>

              {workoutPlans.length === 0 ? (
                <div className={`${CARD} py-14 text-center text-zinc-500`}>
                  <Barbell className="w-12 h-12 mx-auto text-zinc-700 mb-2" />
                  <p className="text-sm font-semibold text-zinc-400">No workout plans created yet</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Click &quot;Create Workout Plan&quot; to assign custom routines to your member(s).
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {workoutPlans.map(plan => (
                    <div
                      key={plan.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 hover:border-zinc-750 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-white text-base">{plan.title}</h4>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                plan.status === "ACTIVE"
                                  ? "bg-lime-400/20 text-lime-400 border border-lime-400/30"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              {plan.status}
                            </span>
                          </div>
                          {plan.customerName && (
                            <p className="text-xs text-lime-400 font-medium mt-0.5">
                              Recipient: {plan.customerName} {plan.customerCode ? `(${plan.customerCode})` : ""}
                            </p>
                          )}
                          {plan.description && (
                            <p className="text-xs text-zinc-400 mt-0.5">{plan.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <button
                            onClick={() => {
                              setEditingWorkoutPlan(plan);
                              setShowWorkoutModal(true);
                            }}
                            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                            title="Edit Plan"
                          >
                            <PencilSimple weight="bold" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteWorkoutPlan(plan)}
                            className="p-1.5 text-red-400 hover:text-red-300 rounded-lg hover:bg-zinc-800 transition-colors"
                            title="Delete Plan"
                          >
                            <Trash weight="bold" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* 4-Field Simplified Workout Routine Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-400 tracking-wider">
                              <th className="pb-2 pl-2">Workout Name</th>
                              <th className="pb-2">Workout Day</th>
                              <th className="pb-2">Sets</th>
                              <th className="pb-2 pr-2">Repetitions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/40">
                            {plan.exercises.map((ex, i) => (
                              <tr key={ex.id || i} className="hover:bg-zinc-800/20">
                                <td className="py-2.5 pl-2 font-semibold text-white">
                                  {ex.exerciseName || ex.exercise_name}
                                </td>
                                <td className="py-2.5 text-lime-400 font-medium">
                                  {ex.dayOfWeek || ex.day_of_week || "Day 1"}
                                </td>
                                <td className="py-2.5 text-zinc-300 font-mono font-bold">
                                  {ex.sets}
                                </td>
                                <td className="py-2.5 pr-2 text-zinc-300 font-mono font-bold">
                                  {ex.reps}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: MEAL PLANS */}
          {section === "meals" && (
            <div className="space-y-4">
              <div className={`${CARD} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ForkKnife weight="fill" className="w-5 h-5 text-lime-400" />
                    Nutrition & Meal Plans
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Preserve nutritional guidance with daily meal structure and portions.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setEditingMealPlan(null);
                    setShowMealModal(true);
                  }}
                  className="bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-colors self-start sm:self-auto"
                >
                  <Plus weight="bold" className="w-3.5 h-3.5" />
                  Create Meal Plan
                </button>
              </div>

              {mealPlans.length === 0 ? (
                <div className={`${CARD} py-14 text-center text-zinc-500`}>
                  <ForkKnife className="w-12 h-12 mx-auto text-zinc-700 mb-2" />
                  <p className="text-sm font-semibold text-zinc-400">No meal plans assigned yet</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Click &quot;Create Meal Plan&quot; to assign daily meal targets to members.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {mealPlans.map(plan => (
                    <div
                      key={plan.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 hover:border-zinc-750 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-white text-base">{plan.title}</h4>
                            {plan.dailyCalorieTarget && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 text-lime-400">
                                {plan.dailyCalorieTarget} kcal / day
                              </span>
                            )}
                          </div>
                          {plan.customerName && (
                            <p className="text-xs text-lime-400 font-medium mt-0.5">
                              Recipient: {plan.customerName} {plan.customerCode ? `(${plan.customerCode})` : ""}
                            </p>
                          )}
                          {plan.notes && <p className="text-xs text-zinc-400 mt-0.5">{plan.notes}</p>}
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <button
                            onClick={() => {
                              setEditingMealPlan(plan);
                              setShowMealModal(true);
                            }}
                            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                            title="Edit Plan"
                          >
                            <PencilSimple weight="bold" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteMealPlan(plan)}
                            className="p-1.5 text-red-400 hover:text-red-300 rounded-lg hover:bg-zinc-800 transition-colors"
                            title="Delete Plan"
                          >
                            <Trash weight="bold" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Meals Grid */}
                      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                        {plan.items.map((it, i) => (
                          <div
                            key={it.id || i}
                            className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-lime-400">
                                {it.mealType || it.meal_type}
                              </span>
                              {it.portion && (
                                <span className="text-zinc-400 font-mono text-[11px]">{it.portion}</span>
                              )}
                            </div>
                            <div className="font-semibold text-white">{it.foodName || it.food_name}</div>
                            {(it.nutritionalInstructions || it.instructions) && (
                              <div className="text-[11px] text-zinc-400">
                                {it.nutritionalInstructions || it.instructions}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION 4: ATTENDANCE & PT SESSIONS */}
          {section === "attendance" && (
            <div className="space-y-4">
              <div className={`${CARD} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <CalendarCheck weight="fill" className="w-5 h-5 text-lime-400" />
                    Attendance & PT Sessions
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {scope === "individual" && currentMember
                      ? `History for ${currentMember.customer_name}: gym entrance recorded by reception & completed 1-on-1 PT sessions.`
                      : "Recent completed 1-on-1 personal training sessions across your assigned member roster."}
                  </p>
                </div>

                <button
                  onClick={() => setShowRecordSessionModal(true)}
                  className="bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-colors self-start sm:self-auto"
                >
                  <Plus weight="bold" className="w-3.5 h-3.5" />
                  Record 1-on-1 PT Session
                </button>
              </div>

              {scope === "individual" ? (
                attendance.length === 0 ? (
                  <div className={`${CARD} py-14 text-center text-zinc-500`}>
                    <CalendarCheck className="w-12 h-12 mx-auto text-zinc-700 mb-2" />
                    <p className="text-sm font-semibold text-zinc-400">No attendance records yet</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Check-ins recorded at the desk and completed PT sessions will appear here.
                    </p>
                  </div>
                ) : (
                  <div className={`${CARD} overflow-x-auto`}>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-400 tracking-wider">
                          <th className="pb-2.5 pl-2">Activity Type</th>
                          <th className="pb-2.5">Date & Time</th>
                          <th className="pb-2.5">Focus / Details</th>
                          <th className="pb-2.5">Recorded By</th>
                          <th className="pb-2.5 pr-2">Coach Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/40">
                        {attendance.map(item => (
                          <tr key={item.id} className="hover:bg-zinc-800/20">
                            <td className="py-3 pl-2 font-semibold">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  item.source === "PT_SESSION"
                                    ? "bg-purple-400/20 text-purple-300 border border-purple-400/30"
                                    : "bg-blue-400/20 text-blue-300 border border-blue-400/30"
                                }`}
                              >
                                {item.source === "PT_SESSION" ? "1-on-1 PT Session" : "Gym Check-in"}
                              </span>
                            </td>
                            <td className="py-3 text-white font-mono">
                              {new Date(item.activity_time).toLocaleDateString()} at{" "}
                              {new Date(item.activity_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="py-3 text-zinc-200 font-medium">
                              {item.session_focus || "General Entrance"}
                            </td>
                            <td className="py-3 text-zinc-400">
                              {item.recorded_by_name || (item.source === "PT_SESSION" ? "Coach" : "Reception Desk")}
                            </td>
                            <td className="py-3 pr-2 text-zinc-400 max-w-xs truncate">
                              {item.notes || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                /* All Members Scope */
                ptSessionsAll.length === 0 ? (
                  <div className={`${CARD} py-14 text-center text-zinc-500`}>
                    <CalendarCheck className="w-12 h-12 mx-auto text-zinc-700 mb-2" />
                    <p className="text-sm font-semibold text-zinc-400">No completed PT sessions recorded</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Click &quot;Record 1-on-1 PT Session&quot; to log training sessions for your members.
                    </p>
                  </div>
                ) : (
                  <div className={`${CARD} overflow-x-auto`}>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-400 tracking-wider">
                          <th className="pb-2.5 pl-2">Member</th>
                          <th className="pb-2.5">Date</th>
                          <th className="pb-2.5">Duration</th>
                          <th className="pb-2.5">Session Focus</th>
                          <th className="pb-2.5">Performance Notes</th>
                          <th className="pb-2.5 text-right pr-2">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/40">
                        {ptSessionsAll.map(session => (
                          <tr key={session.id} className="hover:bg-zinc-800/20">
                            <td className="py-3 pl-2 font-semibold text-white">
                              {session.customerName || "Member"} {session.customerCode ? `(${session.customerCode})` : ""}
                            </td>
                            <td className="py-3 text-zinc-300 font-mono">
                              {new Date(session.sessionDate).toLocaleDateString()}
                            </td>
                            <td className="py-3 text-lime-400 font-mono font-bold">
                              {session.durationMinutes} min
                            </td>
                            <td className="py-3 text-white font-medium">
                              {session.sessionFocus}
                            </td>
                            <td className="py-3 text-zinc-400 max-w-xs truncate">
                              {session.performanceNotes || "—"}
                            </td>
                            <td className="py-3 text-right pr-2">
                              <button
                                onClick={() => handleSelectMember(session.customerId)}
                                className="text-lime-400 hover:underline text-xs font-semibold"
                              >
                                View Member &rarr;
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          )}

          {/* SECTION 5: PROGRESS RECORDS (Simplified 4-field structure) */}
          {section === "progress" && (
            <div className="space-y-4">
              <div className={`${CARD} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <TrendUp weight="fill" className="w-5 h-5 text-lime-400" />
                    Member Progress Records
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Simplified progress tracking: Weight, Strength, General Notes, and automatic Record Date.
                  </p>
                </div>

                <button
                  onClick={() => setShowRecordProgressModal(true)}
                  className="bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-colors self-start sm:self-auto"
                >
                  <Plus weight="bold" className="w-3.5 h-3.5" />
                  Record Progress
                </button>
              </div>

              {progressRecords.length === 0 ? (
                <div className={`${CARD} py-14 text-center text-zinc-500`}>
                  <TrendUp className="w-12 h-12 mx-auto text-zinc-700 mb-2" />
                  <p className="text-sm font-semibold text-zinc-400">No progress milestones recorded</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Log member weight and strength milestones to track ongoing fitness progress.
                  </p>
                </div>
              ) : (
                <div className={`${CARD} overflow-x-auto`}>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-400 tracking-wider">
                        {scope === "all" && <th className="pb-2.5 pl-2">Member</th>}
                        <th className={`pb-2.5 ${scope === "all" ? "" : "pl-2"}`}>Record Date</th>
                        <th className="pb-2.5">Weight</th>
                        <th className="pb-2.5">Strength</th>
                        <th className="pb-2.5">General Notes</th>
                        <th className="pb-2.5 text-right pr-2">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                      {progressRecords.map(rec => (
                        <tr key={rec.id} className="hover:bg-zinc-800/20">
                          {scope === "all" && (
                            <td className="py-3 pl-2 font-semibold text-white">
                              {rec.customerName || "Member"} {rec.customerCode ? `(${rec.customerCode})` : ""}
                            </td>
                          )}
                          <td className={`py-3 text-zinc-300 font-mono ${scope === "all" ? "" : "pl-2"}`}>
                            {new Date(rec.recordedDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </td>
                          <td className="py-3 text-lime-400 font-mono font-bold">
                            {rec.weightKg ? `${rec.weightKg} kg` : "—"}
                          </td>
                          <td className="py-3 text-white font-medium">
                            {rec.workoutPerformance || (rec.benchPressMaxKg ? `Bench: ${rec.benchPressMaxKg}kg` : "—")}
                          </td>
                          <td className="py-3 text-zinc-400 max-w-sm truncate">
                            {rec.notes || "—"}
                          </td>
                          <td className="py-3 text-right pr-2">
                            <button
                              onClick={() => handleDeleteProgressRecord(rec.id)}
                              className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-zinc-800 transition-colors"
                              title="Delete record"
                            >
                              <Trash weight="bold" className="w-4 h-4" />
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
        </>
      )}

      {/* 4. MODALS */}

      {/* Video Player Modal */}
      {playingVideoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 w-full max-w-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <Play weight="fill" className="w-4 h-4 text-lime-400" />
                {playingVideoTitle}
              </h4>
              <button
                onClick={() => setPlayingVideoUrl(null)}
                className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
              >
                <X weight="bold" className="w-5 h-5" />
              </button>
            </div>

            <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-zinc-800">
              <video src={playingVideoUrl} controls autoPlay className="w-full h-full object-contain" />
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setPlayingVideoUrl(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-colors"
              >
                Close Video
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Upload & Distribution Modal */}
      {showVideoUploadModal && (
        <VideoUploadModal
          trainerId={effectiveTrainerId || ""}
          assignedMembers={assignedMembers}
          initialCustomerId={scope === "individual" ? selectedMemberId : null}
          initialScope={scope}
          onClose={() => setShowVideoUploadModal(false)}
          onUploaded={async () => {
            setShowVideoUploadModal(false);
            await loadCoachingData();
          }}
        />
      )}

      {/* Create / Edit Workout Plan Modal */}
      {showWorkoutModal && (
        <WorkoutPlanModal
          trainerId={effectiveTrainerId || ""}
          assignedMembers={assignedMembers}
          initialCustomerId={scope === "individual" ? selectedMemberId : null}
          initialScope={scope}
          planToEdit={editingWorkoutPlan}
          onClose={() => {
            setShowWorkoutModal(false);
            setEditingWorkoutPlan(null);
          }}
          onSaved={async () => {
            setShowWorkoutModal(false);
            setEditingWorkoutPlan(null);
            await loadCoachingData();
          }}
        />
      )}

      {/* Create / Edit Meal Plan Modal */}
      {showMealModal && (
        <MealPlanModal
          trainerId={effectiveTrainerId || ""}
          assignedMembers={assignedMembers}
          initialCustomerId={scope === "individual" ? selectedMemberId : null}
          initialScope={scope}
          planToEdit={editingMealPlan}
          onClose={() => {
            setShowMealModal(false);
            setEditingMealPlan(null);
          }}
          onSaved={async () => {
            setShowMealModal(false);
            setEditingMealPlan(null);
            await loadCoachingData();
          }}
        />
      )}

      {/* Record 1-on-1 PT Session Modal */}
      {showRecordSessionModal && (
        <RecordSessionModal
          trainerId={effectiveTrainerId || ""}
          assignedMembers={assignedMembers}
          initialCustomerId={scope === "individual" ? selectedMemberId : null}
          onClose={() => setShowRecordSessionModal(false)}
          onSaved={async () => {
            setShowRecordSessionModal(false);
            await loadCoachingData();
          }}
        />
      )}

      {/* Record Member Progress Modal (Simplified) */}
      {showRecordProgressModal && (
        <RecordProgressModal
          trainerId={effectiveTrainerId || ""}
          assignedMembers={assignedMembers}
          initialCustomerId={scope === "individual" ? selectedMemberId : null}
          onClose={() => setShowRecordProgressModal(false)}
          onSaved={async () => {
            setShowRecordProgressModal(false);
            await loadCoachingData();
          }}
        />
      )}
    </div>
  );
}

// ==============================================================================
// 1. VIDEO UPLOAD & DISTRIBUTION MODAL
// ==============================================================================
function VideoUploadModal({
  trainerId,
  assignedMembers,
  initialCustomerId,
  initialScope,
  onClose,
  onUploaded,
}: {
  trainerId: string;
  assignedMembers: AssignedMemberItem[];
  initialCustomerId: string | null;
  initialScope: "individual" | "all";
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [targetScope, setTargetScope] = useState<"individual" | "all">(initialScope);
  const [targetCustomerId, setTargetCustomerId] = useState<string>(
    initialCustomerId || (assignedMembers.length > 0 ? assignedMembers[0].customer_id : "")
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select a video file (MP4, WebM, QuickTime, max 50MB).");
      return;
    }
    if (!title.trim()) {
      toast.error("Please provide a title for the exercise video.");
      return;
    }

    let customerIds: string[] = [];
    if (targetScope === "individual") {
      if (!targetCustomerId) {
        toast.error("Please select a recipient member.");
        return;
      }
      customerIds = [targetCustomerId];
    } else {
      customerIds = assignedMembers.map(m => m.customer_id);
    }

    if (targetScope === "all" && customerIds.length > 0) {
      const ok = confirm(`Publish this exercise video to all ${customerIds.length} assigned members?`);
      if (!ok) return;
    }

    setIsSubmitting(true);
    try {
      const res = await distributeExerciseVideo({
        trainerId,
        file,
        customerIds,
        title: title.trim(),
        description: description.trim() || undefined,
      });

      if (res.failed.length > 0) {
        toast.warning(
          `Video uploaded. Assigned to ${res.successful.length} members, ${res.failed.length} failed.`
        );
      } else {
        toast.success(
          targetScope === "all"
            ? `Video uploaded and distributed to all ${res.successful.length} assigned members!`
            : "Exercise video uploaded and assigned to member!"
        );
      }

      onUploaded();
    } catch (err: unknown) {
      console.error("Video upload error:", err);
      toast.error((err as Error)?.message || "Failed to upload and distribute video.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <VideoCamera weight="fill" className="w-5 h-5 text-lime-400" />
            <h4 className="font-bold text-white text-base">Upload & Distribute Video</h4>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-lg">
            <X weight="bold" className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target Distribution Selector */}
          <div>
            <label className={LABEL}>Distribution Recipient *</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                onClick={() => setTargetScope("individual")}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                  targetScope === "individual"
                    ? "bg-lime-400 text-zinc-950 border-lime-400"
                    : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                }`}
              >
                <User weight="bold" className="w-3.5 h-3.5" />
                Individual
              </button>
              <button
                type="button"
                onClick={() => setTargetScope("all")}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                  targetScope === "all"
                    ? "bg-lime-400 text-zinc-950 border-lime-400"
                    : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                }`}
              >
                <Users weight="bold" className="w-3.5 h-3.5" />
                All My Members ({assignedMembers.length})
              </button>
            </div>

            {targetScope === "individual" ? (
              <select
                value={targetCustomerId}
                onChange={e => setTargetCustomerId(e.target.value)}
                className={INPUT}
                required
              >
                {assignedMembers.map(m => (
                  <option key={m.id} value={m.customer_id}>
                    {m.customer_name} ({m.customer_code})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-[11px] text-zinc-400 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                Will be published to all <strong>{assignedMembers.length} active members</strong> currently assigned to you.
              </p>
            )}
          </div>

          <div>
            <label className={LABEL}>Video Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Barbell Squat Form & Depth Guide"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className={INPUT}
            />
          </div>

          <div>
            <label className={LABEL}>Coaching Notes / Instructions</label>
            <textarea
              rows={2}
              placeholder="Key form cues: bracing, foot placement, knee tracking..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={INPUT}
            />
          </div>

          <div>
            <label className={LABEL}>Video File (MP4, WebM, MOV, max 50MB) *</label>
            <input
              ref={fileInputRef}
              type="file"
              required
              accept="video/mp4,video/webm,video/quicktime,video/ogg"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-lime-400 file:text-zinc-950 hover:file:bg-lime-300"
            />
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !file}
              className="flex-1 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <div className="w-3.5 h-3.5 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
              ) : (
                <UploadSimple weight="bold" className="w-4 h-4" />
              )}
              {targetScope === "all" ? `Distribute to All (${assignedMembers.length})` : "Publish Video"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==============================================================================
// 2. SIMPLIFIED WORKOUT PLAN MODAL (4 Fields: Name, Day, Sets, Repetitions)
// ==============================================================================
function WorkoutPlanModal({
  trainerId,
  assignedMembers,
  initialCustomerId,
  initialScope,
  planToEdit,
  onClose,
  onSaved,
}: {
  trainerId: string;
  assignedMembers: AssignedMemberItem[];
  initialCustomerId: string | null;
  initialScope: "individual" | "all";
  planToEdit: WorkoutPlanWithExercises | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(planToEdit?.title || "Custom Workout Plan");
  const [targetScope, setTargetScope] = useState<"individual" | "all">(
    planToEdit ? "individual" : initialScope
  );
  const [targetCustomerId, setTargetCustomerId] = useState<string>(
    planToEdit?.customerId || initialCustomerId || (assignedMembers.length > 0 ? assignedMembers[0].customer_id : "")
  );

  // 4 Fields per entry: workoutName, workoutDay, sets, reps
  const [entries, setEntries] = useState<
    Array<{
      id?: string;
      workoutName: string;
      workoutDay: string;
      sets: number;
      reps: number;
    }>
  >(
    planToEdit?.exercises && planToEdit.exercises.length > 0
      ? planToEdit.exercises.map(e => ({
          id: e.id,
          workoutName: e.exerciseName || e.exercise_name || "",
          workoutDay: e.dayOfWeek || e.day_of_week || "Monday",
          sets: Number(e.sets) || 3,
          reps: Number(e.reps) || 10,
        }))
      : [
          { workoutName: "Barbell Bench Press", workoutDay: "Monday", sets: 4, reps: 12 },
          { workoutName: "Squats", workoutDay: "Wednesday", sets: 3, reps: 15 },
          { workoutName: "Shoulder Press", workoutDay: "Friday", sets: 3, reps: 12 },
        ]
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApplyTemplate = (tpl: typeof WORKOUT_TEMPLATES[0]) => {
    setTitle(tpl.name);
    setEntries(
      tpl.entries.map(e => ({
        workoutName: e.exerciseName,
        workoutDay: e.dayOfWeek,
        sets: e.sets,
        reps: e.reps,
      }))
    );
    toast.success(`Template "${tpl.name}" loaded!`);
  };

  const handleAddEntry = () => {
    setEntries(prev => [
      ...prev,
      { workoutName: "", workoutDay: "Monday", sets: 3, reps: 10 },
    ]);
  };

  const handleRemoveEntry = (idx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a plan title.");
      return;
    }
    const validEntries = entries.filter(e => e.workoutName.trim());
    if (validEntries.length === 0) {
      toast.error("Please provide at least one workout entry.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (planToEdit) {
        // Edit existing plan
        await updateWorkoutPlan(planToEdit.id, {
          title: title.trim(),
          exercises: validEntries.map((e, idx) => ({
            id: e.id,
            exerciseName: e.workoutName.trim(),
            dayOfWeek: e.workoutDay.trim() || "Day 1",
            sets: Number(e.sets) || 3,
            reps: Number(e.reps) || 10,
            orderIndex: idx,
          })),
        });
        toast.success("Workout plan updated successfully!");
      } else {
        // New plan distribution
        let customerIds: string[] = [];
        if (targetScope === "individual") {
          if (!targetCustomerId) {
            toast.error("Please select a recipient member.");
            return;
          }
          customerIds = [targetCustomerId];
        } else {
          customerIds = assignedMembers.map(m => m.customer_id);
        }

        if (targetScope === "all" && customerIds.length > 0) {
          const ok = confirm(`Publish this workout plan to all ${customerIds.length} assigned members?`);
          if (!ok) return;
        }

        const res = await distributeWorkoutPlan({
          trainerId,
          customerIds,
          title: title.trim(),
          exercises: validEntries.map(e => ({
            exerciseName: e.workoutName.trim(),
            dayOfWeek: e.workoutDay.trim() || "Day 1",
            sets: Number(e.sets) || 3,
            reps: Number(e.reps) || 10,
          })),
        });

        if (res.failed.length > 0) {
          toast.warning(
            `Assigned to ${res.successful.length} members, ${res.failed.length} failed.`
          );
        } else {
          toast.success(
            targetScope === "all"
              ? `Workout plan distributed to all ${res.successful.length} members!`
              : "Workout plan created and assigned to member!"
          );
        }
      }

      onSaved();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to save workout plan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Barbell weight="fill" className="w-5 h-5 text-lime-400" />
            <h4 className="font-bold text-white text-base">
              {planToEdit ? "Edit Workout Plan" : "Create Workout Plan"}
            </h4>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-lg">
            <X weight="bold" className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Templates (only when creating) */}
        {!planToEdit && (
          <div className="bg-zinc-800/40 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-300 font-semibold flex items-center gap-1.5 shrink-0">
              <Sparkle weight="bold" className="w-3.5 h-3.5 text-lime-400" />
              Quick Templates:
            </span>
            <div className="flex gap-1.5 overflow-x-auto">
              {WORKOUT_TEMPLATES.map(tpl => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => handleApplyTemplate(tpl)}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-lime-400 text-[11px] font-semibold border border-zinc-700 transition-colors whitespace-nowrap"
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 pr-1">
          {/* Target Recipient Selector (only when creating) */}
          {!planToEdit && (
            <div>
              <label className={LABEL}>Distribution Recipient *</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setTargetScope("individual")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                    targetScope === "individual"
                      ? "bg-lime-400 text-zinc-950 border-lime-400"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                  }`}
                >
                  <User weight="bold" className="w-3.5 h-3.5" />
                  Individual Member
                </button>
                <button
                  type="button"
                  onClick={() => setTargetScope("all")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                    targetScope === "all"
                      ? "bg-lime-400 text-zinc-950 border-lime-400"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                  }`}
                >
                  <Users weight="bold" className="w-3.5 h-3.5" />
                  All My Members ({assignedMembers.length})
                </button>
              </div>

              {targetScope === "individual" ? (
                <select
                  value={targetCustomerId}
                  onChange={e => setTargetCustomerId(e.target.value)}
                  className={INPUT}
                  required
                >
                  {assignedMembers.map(m => (
                    <option key={m.id} value={m.customer_id}>
                      {m.customer_name} ({m.customer_code})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[11px] text-zinc-400 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                  Will assign this workout plan to all <strong>{assignedMembers.length} members</strong> under your supervision.
                </p>
              )}
            </div>
          )}

          <div>
            <label className={LABEL}>Plan Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. 3-Day Strength & Hypertrophy Split"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className={INPUT}
            />
          </div>

          {/* 4 FIELDS ONLY: Workout Name, Workout Day, Sets, Repetitions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={LABEL}>
                Workout Entries ({entries.length}) &mdash; Name, Day, Sets, Reps
              </label>
              <button
                type="button"
                onClick={handleAddEntry}
                className="text-xs text-lime-400 hover:underline font-bold"
              >
                + Add Workout Entry
              </button>
            </div>

            <div className="space-y-2">
              {entries.map((entry, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-zinc-800/40 border border-zinc-800 rounded-xl grid grid-cols-12 gap-2 items-center"
                >
                  <div className="col-span-12 sm:col-span-5">
                    <label className="text-[10px] text-zinc-500 font-semibold block sm:hidden">Workout Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Workout Name (e.g. Bench Press)"
                      value={entry.workoutName}
                      onChange={e => {
                        const val = e.target.value;
                        setEntries(prev => prev.map((it, i) => (i === idx ? { ...it, workoutName: val } : it)));
                      }}
                      className={INPUT}
                    />
                  </div>

                  <div className="col-span-4 sm:col-span-3">
                    <label className="text-[10px] text-zinc-500 font-semibold block sm:hidden">Day</label>
                    <input
                      type="text"
                      required
                      placeholder="Day (e.g. Monday)"
                      value={entry.workoutDay}
                      onChange={e => {
                        const val = e.target.value;
                        setEntries(prev => prev.map((it, i) => (i === idx ? { ...it, workoutDay: val } : it)));
                      }}
                      className={INPUT}
                    />
                  </div>

                  <div className="col-span-3 sm:col-span-1.5">
                    <label className="text-[10px] text-zinc-500 font-semibold block sm:hidden">Sets</label>
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="Sets"
                      value={entry.sets}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setEntries(prev => prev.map((it, i) => (i === idx ? { ...it, sets: val } : it)));
                      }}
                      className={INPUT}
                    />
                  </div>

                  <div className="col-span-3 sm:col-span-1.5">
                    <label className="text-[10px] text-zinc-500 font-semibold block sm:hidden">Reps</label>
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="Reps"
                      value={entry.reps}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setEntries(prev => prev.map((it, i) => (i === idx ? { ...it, reps: val } : it)));
                      }}
                      className={INPUT}
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemoveEntry(idx)}
                      disabled={entries.length <= 1}
                      className="p-1.5 text-zinc-500 hover:text-red-400 disabled:opacity-30 rounded"
                      title="Remove entry"
                    >
                      <Trash weight="bold" className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 flex gap-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <div className="w-3.5 h-3.5 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
              ) : (
                <Check weight="bold" className="w-4 h-4" />
              )}
              {planToEdit
                ? "Save Changes"
                : targetScope === "all"
                ? `Distribute to All (${assignedMembers.length})`
                : "Assign Workout Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==============================================================================
// 3. MEAL PLAN MODAL
// ==============================================================================
function MealPlanModal({
  trainerId,
  assignedMembers,
  initialCustomerId,
  initialScope,
  planToEdit,
  onClose,
  onSaved,
}: {
  trainerId: string;
  assignedMembers: AssignedMemberItem[];
  initialCustomerId: string | null;
  initialScope: "individual" | "all";
  planToEdit: MealPlanWithItems | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(planToEdit?.title || "Daily Nutrition Routine");
  const [dailyCalories, setDailyCalories] = useState<number | null>(
    planToEdit?.dailyCalorieTarget ?? 2400
  );
  const [notes, setNotes] = useState(planToEdit?.notes || "");
  const [targetScope, setTargetScope] = useState<"individual" | "all">(
    planToEdit ? "individual" : initialScope
  );
  const [targetCustomerId, setTargetCustomerId] = useState<string>(
    planToEdit?.customerId || initialCustomerId || (assignedMembers.length > 0 ? assignedMembers[0].customer_id : "")
  );

  const [items, setItems] = useState<
    Array<{
      id?: string;
      mealType: string;
      foodName: string;
      portion: string;
      instructions: string;
    }>
  >(
    planToEdit?.items && planToEdit.items.length > 0
      ? planToEdit.items.map(it => ({
          id: it.id,
          mealType: (it.mealType || it.meal_type || "BREAKFAST").toLowerCase(),
          foodName: it.foodName || it.food_name || "",
          portion: it.portion || "",
          instructions: it.nutritionalInstructions || it.instructions || "",
        }))
      : [
          { mealType: "breakfast", foodName: "Oatmeal with Honey & 3 Boiled Eggs", portion: "80g oats, 3 eggs", instructions: "Drink 500ml water upon waking" },
          { mealType: "lunch", foodName: "Grilled Chicken Breast with White Rice", portion: "200g chicken, 150g cooked rice", instructions: "Add fresh garden salad" },
          { mealType: "dinner", foodName: "Fish with Steamed Vegetables", portion: "200g fish fillet, mixed greens", instructions: "Season with lemon juice and black pepper" },
        ]
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApplyTemplate = (tpl: typeof MEAL_TEMPLATES[0]) => {
    setTitle(tpl.name);
    setDailyCalories(tpl.dailyCalories);
    setNotes(tpl.notes);
    setItems(
      tpl.items.map(it => ({
        mealType: it.mealType.toLowerCase(),
        foodName: it.foodName,
        portion: it.portion,
        instructions: it.instructions,
      }))
    );
    toast.success(`Template "${tpl.name}" loaded!`);
  };

  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      { mealType: "snack", foodName: "", portion: "", instructions: "" },
    ]);
  };

  const handleRemoveItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a meal plan title.");
      return;
    }
    const validItems = items.filter(it => it.foodName.trim());
    if (validItems.length === 0) {
      toast.error("Please add at least one meal item.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (planToEdit) {
        // Edit existing plan
        await updateMealPlan(planToEdit.id, {
          title: title.trim(),
          dailyCalories: dailyCalories ?? null,
          notes: notes.trim() || null,
          items: validItems.map((it, idx) => ({
            id: it.id,
            mealType: it.mealType.toUpperCase(),
            foodName: it.foodName.trim(),
            portion: it.portion.trim(),
            instructions: it.instructions?.trim() || undefined,
            orderIndex: idx,
          })),
        });
        toast.success("Meal plan updated successfully!");
      } else {
        // Distribute new plan
        let customerIds: string[] = [];
        if (targetScope === "individual") {
          if (!targetCustomerId) {
            toast.error("Please select a recipient member.");
            return;
          }
          customerIds = [targetCustomerId];
        } else {
          customerIds = assignedMembers.map(m => m.customer_id);
        }

        if (targetScope === "all" && customerIds.length > 0) {
          const ok = confirm(`Publish this meal plan to all ${customerIds.length} assigned members?`);
          if (!ok) return;
        }

        const res = await distributeMealPlan({
          trainerId,
          customerIds,
          title: title.trim(),
          dailyCalories: dailyCalories ?? undefined,
          notes: notes.trim() || undefined,
          items: validItems.map(it => ({
            mealType: it.mealType.toUpperCase(),
            foodName: it.foodName.trim(),
            portion: it.portion.trim(),
            instructions: it.instructions?.trim() || undefined,
          })),
        });

        if (res.failed.length > 0) {
          toast.warning(
            `Assigned to ${res.successful.length} members, ${res.failed.length} failed.`
          );
        } else {
          toast.success(
            targetScope === "all"
              ? `Meal plan distributed to all ${res.successful.length} members!`
              : "Meal plan created and assigned to member!"
          );
        }
      }

      onSaved();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to save meal plan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <ForkKnife weight="fill" className="w-5 h-5 text-lime-400" />
            <h4 className="font-bold text-white text-base">
              {planToEdit ? "Edit Meal Plan" : "Create Meal Plan"}
            </h4>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-lg">
            <X weight="bold" className="w-5 h-5" />
          </button>
        </div>

        {/* Templates Shortcut */}
        {!planToEdit && (
          <div className="bg-zinc-800/40 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-300 font-semibold flex items-center gap-1.5 shrink-0">
              <Sparkle weight="bold" className="w-3.5 h-3.5 text-lime-400" />
              Quick Templates:
            </span>
            <div className="flex gap-1.5 overflow-x-auto">
              {MEAL_TEMPLATES.map(tpl => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => handleApplyTemplate(tpl)}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-lime-400 text-[11px] font-semibold border border-zinc-700 transition-colors whitespace-nowrap"
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 pr-1">
          {/* Target Recipient Selector (only when creating) */}
          {!planToEdit && (
            <div>
              <label className={LABEL}>Distribution Recipient *</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setTargetScope("individual")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                    targetScope === "individual"
                      ? "bg-lime-400 text-zinc-950 border-lime-400"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                  }`}
                >
                  <User weight="bold" className="w-3.5 h-3.5" />
                  Individual Member
                </button>
                <button
                  type="button"
                  onClick={() => setTargetScope("all")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                    targetScope === "all"
                      ? "bg-lime-400 text-zinc-950 border-lime-400"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                  }`}
                >
                  <Users weight="bold" className="w-3.5 h-3.5" />
                  All My Members ({assignedMembers.length})
                </button>
              </div>

              {targetScope === "individual" ? (
                <select
                  value={targetCustomerId}
                  onChange={e => setTargetCustomerId(e.target.value)}
                  className={INPUT}
                  required
                >
                  {assignedMembers.map(m => (
                    <option key={m.id} value={m.customer_id}>
                      {m.customer_name} ({m.customer_code})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[11px] text-zinc-400 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                  Will assign this meal plan to all <strong>{assignedMembers.length} members</strong> under your supervision.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className={LABEL}>Plan Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Calories (kcal)</label>
              <input
                type="number"
                placeholder="e.g. 2400"
                value={dailyCalories ?? ""}
                onChange={e => setDailyCalories(e.target.value ? Number(e.target.value) : null)}
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Nutrition Guidelines / Instructions</label>
            <input
              type="text"
              placeholder="e.g. Stay hydrated, prioritize lean protein, limit sodium"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={INPUT}
            />
          </div>

          {/* Meal Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={LABEL}>Daily Meals ({items.length})</label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-lime-400 hover:underline font-bold"
              >
                + Add Meal
              </button>
            </div>

            <div className="space-y-2.5">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-zinc-800/40 border border-zinc-800 rounded-xl space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-lime-400">Meal #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      disabled={items.length <= 1}
                      className="text-zinc-500 hover:text-red-400 text-xs disabled:opacity-30"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <select
                        value={it.mealType}
                        onChange={e => {
                          const val = e.target.value;
                          setItems(prev => prev.map((item, i) => (i === idx ? { ...item, mealType: val } : item)));
                        }}
                        className={INPUT}
                      >
                        <option value="breakfast">Breakfast</option>
                        <option value="lunch">Lunch</option>
                        <option value="dinner">Dinner</option>
                        <option value="snack">Snack</option>
                        <option value="pre-workout">Pre-Workout</option>
                        <option value="post-workout">Post-Workout</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        required
                        placeholder="Food Item(s)"
                        value={it.foodName}
                        onChange={e => {
                          const val = e.target.value;
                          setItems(prev => prev.map((item, i) => (i === idx ? { ...item, foodName: val } : item)));
                        }}
                        className={INPUT}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <input
                        type="text"
                        placeholder="Portion (e.g. 200g chicken, 150g rice)"
                        value={it.portion}
                        onChange={e => {
                          const val = e.target.value;
                          setItems(prev => prev.map((item, i) => (i === idx ? { ...item, portion: val } : item)));
                        }}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Timing / Instructions"
                        value={it.instructions}
                        onChange={e => {
                          const val = e.target.value;
                          setItems(prev => prev.map((item, i) => (i === idx ? { ...item, instructions: val } : item)));
                        }}
                        className={INPUT}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 flex gap-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <div className="w-3.5 h-3.5 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
              ) : (
                <Check weight="bold" className="w-4 h-4" />
              )}
              {planToEdit
                ? "Save Changes"
                : targetScope === "all"
                ? `Distribute to All (${assignedMembers.length})`
                : "Assign Meal Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==============================================================================
// 4. RECORD 1-ON-1 PT SESSION MODAL
// ==============================================================================
function RecordSessionModal({
  trainerId,
  assignedMembers,
  initialCustomerId,
  onClose,
  onSaved,
}: {
  trainerId: string;
  assignedMembers: AssignedMemberItem[];
  initialCustomerId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customerId, setCustomerId] = useState(
    initialCustomerId || (assignedMembers.length > 0 ? assignedMembers[0].customer_id : "")
  );
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [sessionFocus, setSessionFocus] = useState("Lower Body Strength & Mobility");
  const [performanceNotes, setPerformanceNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      toast.error("Please select a member.");
      return;
    }

    setIsSubmitting(true);
    try {
      await recordPersonalTrainingSession({
        customerId,
        trainerId,
        sessionDate,
        durationMinutes,
        sessionFocus: sessionFocus.trim() || undefined,
        performanceNotes: performanceNotes.trim() || undefined,
      });
      toast.success("1-on-1 personal training session recorded!");
      onSaved();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to record session.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <CalendarCheck weight="fill" className="w-5 h-5 text-lime-400" />
            <h4 className="font-bold text-white text-base">Record 1-on-1 PT Session</h4>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-lg">
            <X weight="bold" className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={LABEL}>Select Member *</label>
            <select
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              className={INPUT}
              required
            >
              {assignedMembers.map(m => (
                <option key={m.id} value={m.customer_id}>
                  {m.customer_name} ({m.customer_code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Session Date *</label>
              <input
                type="date"
                required
                value={sessionDate}
                onChange={e => setSessionDate(e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Duration (Minutes)</label>
              <input
                type="number"
                min="15"
                max="180"
                value={durationMinutes}
                onChange={e => setDurationMinutes(Number(e.target.value))}
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Session Focus / Workout Area</label>
            <input
              type="text"
              placeholder="e.g. Chest & Triceps, Squat Depth, Deadlift PRs"
              value={sessionFocus}
              onChange={e => setSessionFocus(e.target.value)}
              className={INPUT}
            />
          </div>

          <div>
            <label className={LABEL}>Coach Performance Notes</label>
            <textarea
              rows={2}
              placeholder="Observations, form cues, PRs achieved..."
              value={performanceNotes}
              onChange={e => setPerformanceNotes(e.target.value)}
              className={INPUT}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <div className="w-3.5 h-3.5 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
              ) : (
                <Check weight="bold" className="w-4 h-4" />
              )}
              Save PT Session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==============================================================================
// 5. SIMPLIFIED RECORD PROGRESS MODAL
// 4 Fields ONLY: Weight, Strength, General Notes, Record Date (auto-generated)
// ==============================================================================
function RecordProgressModal({
  trainerId,
  assignedMembers,
  initialCustomerId,
  onClose,
  onSaved,
}: {
  trainerId: string;
  assignedMembers: AssignedMemberItem[];
  initialCustomerId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customerId, setCustomerId] = useState(
    initialCustomerId || (assignedMembers.length > 0 ? assignedMembers[0].customer_id : "")
  );
  const [weight, setWeight] = useState("");
  const [strength, setStrength] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Record date is automatically generated today's date (server source of truth)
  const todayFormatted = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      toast.error("Please select a member.");
      return;
    }

    setIsSubmitting(true);
    try {
      await recordMemberProgress({
        customerId,
        trainerId,
        weightKg: weight ? parseFloat(weight) : undefined,
        workoutPerformance: strength.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Progress record saved successfully!");
      onSaved();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to record member progress.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <TrendUp weight="fill" className="w-5 h-5 text-lime-400" />
            <h4 className="font-bold text-white text-base">Record Member Progress</h4>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-lg">
            <X weight="bold" className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={LABEL}>Select Member *</label>
            <select
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              className={INPUT}
              required
            >
              {assignedMembers.map(m => (
                <option key={m.id} value={m.customer_id}>
                  {m.customer_name} ({m.customer_code})
                </option>
              ))}
            </select>
          </div>

          {/* Record Date: Automatic */}
          <div>
            <label className={LABEL}>Record Date (Automatically Generated)</label>
            <div className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-lime-400 font-mono text-xs font-semibold flex items-center justify-between">
              <span>{todayFormatted}</span>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Today &bull; Auto-Logged</span>
            </div>
          </div>

          {/* Field 1: Weight */}
          <div>
            <label className={LABEL}>Body Weight (kg)</label>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 74.5"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              className={INPUT}
            />
          </div>

          {/* Field 2: Strength */}
          <div>
            <label className={LABEL}>Strength Progress / Benchmarks</label>
            <input
              type="text"
              placeholder="e.g. Bench: 85kg x 3, Squat: 110kg x 5, Pull-ups: 12"
              value={strength}
              onChange={e => setStrength(e.target.value)}
              className={INPUT}
            />
          </div>

          {/* Field 3: General Notes */}
          <div>
            <label className={LABEL}>General Notes</label>
            <textarea
              rows={2}
              placeholder="e.g. Visible conditioning gains, high energy during lifts..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={INPUT}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <div className="w-3.5 h-3.5 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
              ) : (
                <Check weight="bold" className="w-4 h-4" />
              )}
              Save Progress Record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
