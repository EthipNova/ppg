import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Users,
  User,
  VideoCamera,
  Barbell,
  ForkKnife,
  CalendarCheck,
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
  CheckCircle,
  Calendar,
  Clock,
  Lightning,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  fetchMemberWorkoutPlans,
  fetchTrainerWorkoutPlans,
  deleteWorkoutPlan,
  saveDigitalWorkoutLog,
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
  getGymTodayDate,
  getGymTodayWeekday,
  fetchMemberWeeklySchedule,
  saveMemberWeeklySchedule,
  fetchTodayAssignedWorkout,
  fetchMemberWorkoutHistoryForComparison,
  DEFAULT_WEEKLY_SCHEDULE,
  type AssignedMemberItem,
  type WorkoutPlanWithExercises,
  type MealPlanWithItems,
  type ExerciseVideo,
  type MemberAttendanceCombinedItem,
  type PersonalTrainingSessionItem,
  type WorkoutPlan,
} from "../services/personalTrainerService";
import type { RealTrainerProfile } from "../services/trainerProfileService";
import type {
  MemberWeeklyScheduleItem,
  WeekdayName,
  ScheduledExerciseTemplate,
} from "../types";

const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-5";
const INPUT =
  "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50 transition-colors text-xs";
const LABEL = "block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1";

export type CoachingSection = "videos" | "workouts" | "meals" | "attendance";

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

  // Modals
  const [showVideoUploadModal, setShowVideoUploadModal] = useState(false);
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [showWeeklyScheduleModal, setShowWeeklyScheduleModal] = useState(false);
  const [memberWeeklySchedule, setMemberWeeklySchedule] = useState<MemberWeeklyScheduleItem[]>([]);
  const [editingWorkoutPlan, setEditingWorkoutPlan] = useState<WorkoutPlanWithExercises | null>(null);
  const [showMealModal, setShowMealModal] = useState(false);
  const [editingMealPlan, setEditingMealPlan] = useState<MealPlanWithItems | null>(null);
  const [showRecordSessionModal, setShowRecordSessionModal] = useState(false);

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
        const [w, m, att, sched] = await Promise.all([
          fetchMemberWorkoutPlans(selectedMemberId).catch(() => []),
          fetchMemberMealPlans(selectedMemberId).catch(() => []),
          fetchMemberAttendanceHistory(selectedMemberId).catch(() => []),
          fetchMemberWeeklySchedule(selectedMemberId, effectiveTrainerId).catch(() => []),
        ]);
        setWorkoutPlans(w);
        setMealPlans(m);
        setAttendance(att);
        setMemberWeeklySchedule(sched);
      } else {
        // All members focus
        const [w, m, ptSessions] = await Promise.all([
          fetchTrainerWorkoutPlans(effectiveTrainerId).catch(() => []),
          fetchTrainerMealPlans(effectiveTrainerId).catch(() => []),
          fetchTrainerPTSessions(effectiveTrainerId).catch(() => []),
        ]);
        setWorkoutPlans(w);
        setMealPlans(m);
        setPtSessionsAll(ptSessions);
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
              Manage exercise videos, workout routines, meal plans, and attendance from one unified workspace.
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

          {/* SECTION 2: WORKOUT PLANS & WEEKLY SCHEDULE */}
          {section === "workouts" && (
            <div className="space-y-4">
              {/* Header with Routine Config & Record Actions */}
              <div className={`${CARD} flex flex-col md:flex-row md:items-center justify-between gap-4`}>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Barbell weight="fill" className="w-5 h-5 text-lime-400" />
                    Personal Trainer Workout Management
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Configure member-specific weekly schedules (Mon–Sun) & record session performance with Excel-like historical comparison.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
                  <button
                    type="button"
                    onClick={() => setShowWeeklyScheduleModal(true)}
                    className="bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Calendar weight="bold" className="w-3.5 h-3.5 text-lime-400" />
                    Weekly Routine Setup
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingWorkoutPlan(null);
                      setShowWorkoutModal(true);
                    }}
                    className="bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm shadow-lime-400/20"
                  >
                    <Plus weight="bold" className="w-3.5 h-3.5" />
                    Log Today&apos;s Workout
                  </button>
                </div>
              </div>

              {/* Weekly Routine Snapshot Card (When a member is selected or in individual scope) */}
              {selectedMemberId && (
                <div className="bg-zinc-950/70 border border-zinc-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar weight="fill" className="w-3.5 h-3.5 text-lime-400" />
                        Weekly Routine: {currentMember?.customer_name || "Member"}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        (Today: {getGymTodayWeekday()})
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowWeeklyScheduleModal(true)}
                      className="text-xs text-lime-400 hover:underline font-bold"
                    >
                      Edit Routine →
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                    {[
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ].map(day => {
                      const item = memberWeeklySchedule.find(s => s.dayOfWeek === day);
                      const isToday = getGymTodayWeekday() === day;
                      const isRest = Boolean(item?.isRestDay);

                      return (
                        <div
                          key={day}
                          className={`p-2.5 rounded-xl border text-center transition-all ${
                            isToday
                              ? "bg-lime-400/10 border-lime-400/40 text-lime-300 ring-1 ring-lime-400/20 shadow-sm"
                              : "bg-zinc-900 border-zinc-800 text-zinc-300"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono font-bold mb-1">
                            <span className={isToday ? "text-lime-400" : "text-zinc-500"}>
                              {day.slice(0, 3).toUpperCase()}
                            </span>
                            {isToday && (
                              <span className="px-1 py-0.2 bg-lime-400 text-zinc-950 font-black rounded text-[9px]">
                                TODAY
                              </span>
                            )}
                          </div>
                          <p className={`text-xs font-bold truncate ${isRest ? "text-zinc-500" : "text-white"}`}>
                            {isRest ? "Rest Day" : item?.workoutTitle || "Push Day"}
                          </p>
                          {item?.focusArea && !isRest && (
                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                              {item.focusArea}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Workout Session History Logs */}
              {workoutPlans.length === 0 ? (
                <div className={`${CARD} py-14 text-center text-zinc-500`}>
                  <Barbell className="w-12 h-12 mx-auto text-zinc-700 mb-2" />
                  <p className="text-sm font-semibold text-zinc-400">No workout session logs recorded yet</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Click &quot;Log Today&apos;s Workout&quot; to log exercises and sets for your members.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {workoutPlans.map(plan => {
                    const workoutDateStr = plan.workoutDate || plan.startDate || plan.createdAt;
                    const formattedDate = new Date(workoutDateStr).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });

                    return (
                      <div
                        key={plan.id}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 hover:border-zinc-750 transition-colors shadow-sm"
                      >
                        {/* Workout Header Info */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <h4 className="font-bold text-white text-base">{plan.title}</h4>

                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-lime-400/20 text-lime-400 border border-lime-400/30">
                                Saved & Active
                              </span>

                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  plan.isCompleted
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                    : "bg-zinc-800 text-zinc-400 border border-zinc-700/60"
                                }`}
                              >
                                Complete Workout: {plan.isCompleted ? "Yes" : "No"}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                              <span className="text-zinc-300 font-medium">
                                Date: <strong className="text-white font-mono">{formattedDate}</strong>
                              </span>
                              {plan.customerName && (
                                <span className="text-lime-400 font-medium">
                                  Member: <strong>{plan.customerName}</strong> {plan.customerCode ? `(${plan.customerCode})` : ""}
                                </span>
                              )}
                              <span className="text-zinc-400">
                                {plan.exercises.length} exercise{plan.exercises.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            {plan.description && (
                              <p className="text-xs text-zinc-400 mt-1">{plan.description}</p>
                            )}
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center gap-2 self-start sm:self-auto">
                            <button
                              onClick={() => {
                                setEditingWorkoutPlan(plan);
                                setShowWorkoutModal(true);
                              }}
                              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors border border-zinc-700"
                              title="Edit Workout / Log Actuals"
                            >
                              <PencilSimple weight="bold" className="w-3.5 h-3.5 text-lime-400" />
                              <span>Edit / Log</span>
                            </button>
                            <button
                              onClick={() => handleDeleteWorkoutPlan(plan)}
                              className="p-1.5 text-red-400 hover:text-red-300 rounded-xl hover:bg-zinc-800 transition-colors"
                              title="Delete Plan"
                            >
                              <Trash weight="bold" className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Multi-Set Table */}
                        <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-950/60">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-400 tracking-wider bg-zinc-900/80 font-bold">
                                <th className="py-2.5 pl-3">Exercise</th>
                                <th className="py-2.5 px-2 text-center w-14">Set</th>
                                <th className="py-2.5 px-2 text-center text-cyan-400">Planned Reps</th>
                                <th className="py-2.5 px-2 text-center text-cyan-400">Planned (KG)</th>
                                <th className="py-2.5 px-2 text-center text-lime-400">Actual Reps</th>
                                <th className="py-2.5 px-2 text-center text-lime-400">Actual (KG)</th>
                                <th className="py-2.5 pr-3 text-center">Done?</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                              {plan.exercises.flatMap((ex, exIdx) => {
                                const sets =
                                  Array.isArray(ex.setsData) && ex.setsData.length > 0
                                    ? ex.setsData
                                    : [
                                        {
                                          setNumber: 1,
                                          plannedReps: ex.plannedReps ?? ex.planned_reps ?? ex.reps ?? 10,
                                          plannedWeightKg: ex.plannedWeightKg ?? ex.planned_weight_kg ?? null,
                                          actualReps: ex.actualReps ?? ex.actual_reps ?? null,
                                          actualWeightKg: ex.actualWeightKg ?? ex.actual_weight_kg ?? null,
                                          isCompleted: ex.isCompleted ?? ex.is_completed ?? false,
                                        },
                                      ];

                                return sets.map((s, sIdx) => (
                                  <tr
                                    key={`${ex.id || exIdx}-s${s.setNumber || sIdx}`}
                                    className="hover:bg-zinc-850/40"
                                  >
                                    {sIdx === 0 ? (
                                      <td
                                        rowSpan={sets.length}
                                        className="py-2.5 pl-3 font-bold text-white align-top border-r border-zinc-800/60"
                                      >
                                        <div>{ex.exerciseName || ex.exercise_name}</div>
                                        {ex.notes && (
                                          <div className="text-[11px] text-zinc-400 font-normal italic mt-0.5">
                                            {ex.notes}
                                          </div>
                                        )}
                                      </td>
                                    ) : null}

                                    <td className="py-2 px-2 text-center font-mono font-bold text-lime-400">
                                      Set {s.setNumber || sIdx + 1}
                                    </td>

                                    <td className="py-2 px-2 text-center font-mono font-bold text-zinc-200 bg-cyan-400/5">
                                      {s.plannedReps ?? "—"}
                                    </td>
                                    <td className="py-2 px-2 text-center font-mono font-bold text-zinc-200 bg-cyan-400/5">
                                      {s.plannedWeightKg != null ? `${s.plannedWeightKg} kg` : "—"}
                                    </td>

                                    <td className="py-2 px-2 text-center font-mono font-bold text-lime-300 bg-lime-400/5">
                                      {s.actualReps != null ? s.actualReps : "—"}
                                    </td>
                                    <td className="py-2 px-2 text-center font-mono font-bold text-lime-300 bg-lime-400/5">
                                      {s.actualWeightKg != null ? `${s.actualWeightKg} kg` : "—"}
                                    </td>

                                    <td className="py-2 pr-3 text-center">
                                      {s.isCompleted ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-lime-400">
                                          <CheckCircle weight="fill" className="w-3.5 h-3.5 text-lime-400" /> Yes
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-zinc-500 font-medium">No</span>
                                      )}
                                    </td>
                                  </tr>
                                ));
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
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

      {/* Log Workout Session Modal */}
      {showWorkoutModal && (
        <WorkoutSessionRecordingModal
          trainerId={effectiveTrainerId || ""}
          assignedMembers={assignedMembers}
          initialCustomerId={scope === "individual" ? selectedMemberId : null}
          sessionToEdit={editingWorkoutPlan}
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

      {/* Member Weekly Workout Schedule Setup Modal */}
      {showWeeklyScheduleModal && (
        <MemberWeeklyScheduleModal
          trainerId={effectiveTrainerId || ""}
          assignedMembers={assignedMembers}
          initialCustomerId={scope === "individual" ? selectedMemberId : null}
          onClose={() => setShowWeeklyScheduleModal(false)}
          onSaved={async () => {
            setShowWeeklyScheduleModal(false);
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
// 2A. MEMBER WEEKLY WORKOUT SCHEDULE MODAL
// ==============================================================================
function MemberWeeklyScheduleModal({
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
  const [targetCustomerId, setTargetCustomerId] = useState<string>(
    initialCustomerId || (assignedMembers.length > 0 ? assignedMembers[0].customer_id : "")
  );
  const [schedule, setSchedule] = useState<MemberWeeklyScheduleItem[]>([]);
  const [activeDay, setActiveDay] = useState<WeekdayName>("Monday");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const DAYS_OF_WEEK: WeekdayName[] = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  // Load weekly schedule for selected member
  useEffect(() => {
    if (!targetCustomerId) return;
    let mounted = true;
    setLoading(true);
    fetchMemberWeeklySchedule(targetCustomerId, trainerId)
      .then(sched => {
        if (mounted) setSchedule(sched);
      })
      .catch(err => {
        console.error("fetchMemberWeeklySchedule error:", err);
        toast.error("Failed to load weekly schedule.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [targetCustomerId, trainerId]);

  const currentDayItem = schedule.find(s => s.dayOfWeek === activeDay) || {
    customerId: targetCustomerId,
    trainerId,
    dayOfWeek: activeDay,
    workoutTitle: "Rest Day",
    isRestDay: true,
    focusArea: "",
    notes: "",
    exercises: [],
  };

  const updateCurrentDay = (updates: Partial<MemberWeeklyScheduleItem>) => {
    setSchedule(prev =>
      prev.map(item => (item.dayOfWeek === activeDay ? { ...item, ...updates } : item))
    );
  };

  const handleApplyPreset = (presetName: "PPL" | "UPPER_LOWER" | "FULL_BODY") => {
    if (!targetCustomerId) return;
    const base = DEFAULT_WEEKLY_SCHEDULE(targetCustomerId, trainerId);
    if (presetName === "PPL") {
      setSchedule(base);
      toast.success("Standard Push / Pull / Legs weekly split loaded!");
    } else if (presetName === "UPPER_LOWER") {
      setSchedule([
        {
          ...base[0],
          workoutTitle: "Upper Body Strength",
          isRestDay: false,
          focusArea: "Chest, Back, Shoulders",
          notes: "Heavy compound strength movements.",
        },
        {
          ...base[1],
          workoutTitle: "Lower Body Strength",
          isRestDay: false,
          focusArea: "Quads, Glutes & Hamstrings",
          notes: "Squat and hinge focus.",
        },
        {
          ...base[2],
          workoutTitle: "Rest & Active Recovery",
          isRestDay: true,
          focusArea: "Recovery & Mobility",
          notes: "Light walking, sauna/steam session.",
          exercises: [],
        },
        {
          ...base[3],
          workoutTitle: "Upper Body Hypertrophy",
          isRestDay: false,
          focusArea: "Upper Body Volume",
          notes: "Moderate weights, high time under tension.",
        },
        {
          ...base[4],
          workoutTitle: "Lower Body Hypertrophy",
          isRestDay: false,
          focusArea: "Legs & Core",
          notes: "Volume work on quads and calves.",
        },
        {
          ...base[5],
          workoutTitle: "Core & Conditioning",
          isRestDay: false,
          focusArea: "Athletic Stamina",
          notes: "Intervals and core stability.",
        },
        {
          ...base[6],
          workoutTitle: "Rest Day",
          isRestDay: true,
          focusArea: "Full Rest",
          notes: "Complete rest and hydration.",
          exercises: [],
        },
      ]);
      toast.success("Upper / Lower 4-day split loaded!");
    } else if (presetName === "FULL_BODY") {
      setSchedule([
        {
          ...base[0],
          workoutTitle: "Full Body Workout A",
          isRestDay: false,
          focusArea: "Squat & Bench Focus",
          notes: "Heavy compounds with full body balance.",
        },
        {
          ...base[1],
          workoutTitle: "Rest & Recovery",
          isRestDay: true,
          focusArea: "Recovery",
          notes: "Dynamic stretching, foam rolling.",
          exercises: [],
        },
        {
          ...base[2],
          workoutTitle: "Full Body Workout B",
          isRestDay: false,
          focusArea: "Deadlift & Press Focus",
          notes: "Posterior chain and vertical press.",
        },
        {
          ...base[3],
          workoutTitle: "Rest & Recovery",
          isRestDay: true,
          focusArea: "Recovery",
          notes: "Sauna session and light walk.",
          exercises: [],
        },
        {
          ...base[4],
          workoutTitle: "Full Body Workout C",
          isRestDay: false,
          focusArea: "Hypertrophy & Accessories",
          notes: "Isolation work and core stability.",
        },
        {
          ...base[5],
          workoutTitle: "Cardio & Conditioning",
          isRestDay: false,
          focusArea: "Aerobic Capacity",
          notes: "Light running or rowing intervals.",
        },
        {
          ...base[6],
          workoutTitle: "Rest Day",
          isRestDay: true,
          focusArea: "Full Rest",
          notes: "Full day of rest.",
          exercises: [],
        },
      ]);
      toast.success("Full Body 3-day split loaded!");
    }
  };

  const handleAddExercise = () => {
    const nextEx: ScheduledExerciseTemplate = {
      exerciseName: "",
      notes: "",
      sets: [
        { setNumber: 1, plannedReps: 12, plannedWeightKg: 50 },
        { setNumber: 2, plannedReps: 10, plannedWeightKg: 60 },
        { setNumber: 3, plannedReps: 8, plannedWeightKg: 70 },
      ],
    };
    updateCurrentDay({
      exercises: [...(currentDayItem.exercises || []), nextEx],
      isRestDay: false,
    });
  };

  const handleRemoveExercise = (idx: number) => {
    const next = [...(currentDayItem.exercises || [])];
    next.splice(idx, 1);
    updateCurrentDay({ exercises: next });
  };

  const handleAddSet = (exIdx: number) => {
    const exercises = [...(currentDayItem.exercises || [])];
    const ex = exercises[exIdx];
    if (!ex) return;
    const lastSet = ex.sets[ex.sets.length - 1];
    const newSet = {
      setNumber: ex.sets.length + 1,
      plannedReps: lastSet?.plannedReps ?? 10,
      plannedWeightKg: lastSet?.plannedWeightKg ?? 50,
    };
    ex.sets = [...ex.sets, newSet];
    updateCurrentDay({ exercises });
  };

  const handleRemoveSet = (exIdx: number, sIdx: number) => {
    const exercises = [...(currentDayItem.exercises || [])];
    const ex = exercises[exIdx];
    if (!ex || ex.sets.length <= 1) return;
    ex.sets = ex.sets.filter((_, i) => i !== sIdx).map((s, i) => ({ ...s, setNumber: i + 1 }));
    updateCurrentDay({ exercises });
  };

  const handleSave = async () => {
    if (!targetCustomerId) {
      toast.error("Please select a member.");
      return;
    }
    setSaving(true);
    try {
      await saveMemberWeeklySchedule(targetCustomerId, trainerId, schedule);
      toast.success("Weekly workout schedule saved successfully! Previously recorded sessions are preserved.");
      onSaved();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to save weekly schedule.");
    } finally {
      setSaving(false);
    }
  };

  const selectedMemberName = assignedMembers.find(m => m.customer_id === targetCustomerId)?.customer_name || "Member";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 w-full max-w-4xl max-h-[92vh] flex flex-col space-y-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center text-lime-400">
              <Calendar weight="fill" className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-black text-white text-base">
                Weekly Workout Schedule Setup
              </h4>
              <p className="text-[11px] text-zinc-400">
                Configure Monday–Sunday training routines for <strong>{selectedMemberName}</strong>. Editing schedule never overwrites past session records.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-lg">
            <X weight="bold" className="w-5 h-5" />
          </button>
        </div>

        {/* Member Selector if multiple */}
        {assignedMembers.length > 1 && (
          <div>
            <label className={LABEL}>Assigned Member</label>
            <select
              value={targetCustomerId}
              onChange={e => setTargetCustomerId(e.target.value)}
              className={INPUT}
            >
              {assignedMembers.map(m => (
                <option key={m.customer_id} value={m.customer_id}>
                  {m.customer_name} ({m.customer_code || "Member"})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Split Presets */}
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-zinc-300 font-semibold flex items-center gap-1.5 shrink-0">
            <Sparkle weight="bold" className="w-3.5 h-3.5 text-lime-400" />
            Load Split Preset:
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleApplyPreset("PPL")}
              className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-lime-400 text-[11px] font-semibold border border-zinc-700 transition-colors"
            >
              Push / Pull / Legs (PPL)
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset("UPPER_LOWER")}
              className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-lime-400 text-[11px] font-semibold border border-zinc-700 transition-colors"
            >
              Upper / Lower Split
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset("FULL_BODY")}
              className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-lime-400 text-[11px] font-semibold border border-zinc-700 transition-colors"
            >
              Full Body 3-Day
            </button>
          </div>
        </div>

        {/* 7 Days Navigation Pills */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {DAYS_OF_WEEK.map(day => {
            const item = schedule.find(s => s.dayOfWeek === day);
            const isRest = Boolean(item?.isRestDay);
            const isActive = activeDay === day;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setActiveDay(day)}
                className={`flex-1 min-w-[90px] py-2 px-2.5 rounded-2xl text-xs font-bold border transition-all text-center flex flex-col items-center gap-0.5 ${
                  isActive
                    ? "bg-lime-400 text-zinc-950 border-lime-400 shadow-md shadow-lime-400/20"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                }`}
              >
                <span className="uppercase text-[10px] tracking-wider font-mono">
                  {day.slice(0, 3)}
                </span>
                <span className={`text-[11px] truncate max-w-[85px] ${isRest ? "opacity-60" : "font-extrabold"}`}>
                  {isRest ? "Rest" : item?.workoutTitle ? item.workoutTitle.split("(")[0].trim() : "Workout"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Day Editor */}
        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          {loading ? (
            <div className="py-12 text-center text-zinc-500">
              <div className="w-6 h-6 border-2 border-lime-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading schedule...
            </div>
          ) : (
            <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-2xl space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-lime-400 uppercase tracking-wider font-mono">
                    {activeDay}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {currentDayItem.isRestDay ? "Scheduled Rest Day" : "Training Routine"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateCurrentDay({ isRestDay: !currentDayItem.isRestDay })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                      currentDayItem.isRestDay
                        ? "bg-amber-400/20 text-amber-300 border-amber-400/30"
                        : "bg-lime-400/20 text-lime-400 border-lime-400/30"
                    }`}
                  >
                    <Clock weight="bold" className="w-3.5 h-3.5" />
                    <span>{currentDayItem.isRestDay ? "Marked as Rest Day" : "Active Training Day"}</span>
                  </button>
                </div>
              </div>

              {/* Routine Title & Focus */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Workout Title *</label>
                  <input
                    type="text"
                    value={currentDayItem.workoutTitle}
                    onChange={e => updateCurrentDay({ workoutTitle: e.target.value })}
                    placeholder="e.g. Push (Chest, Shoulders & Triceps)"
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>Muscle Group / Focus Area</label>
                  <input
                    type="text"
                    value={currentDayItem.focusArea || ""}
                    onChange={e => updateCurrentDay({ focusArea: e.target.value })}
                    placeholder="e.g. Chest & Triceps"
                    className={INPUT}
                  />
                </div>
              </div>

              {/* Coach Notes */}
              <div>
                <label className={LABEL}>Training Notes & Guidance</label>
                <input
                  type="text"
                  value={currentDayItem.notes || ""}
                  onChange={e => updateCurrentDay({ notes: e.target.value })}
                  placeholder="e.g. Controlled tempo, 2-minute rest intervals."
                  className={INPUT}
                />
              </div>

              {/* Exercises and Planned Sets */}
              {!currentDayItem.isRestDay && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className={LABEL}>
                        Prescribed Exercises ({currentDayItem.exercises?.length || 0})
                      </label>
                      <span className="text-[11px] text-zinc-500">
                        Default exercises & sets auto-loaded when logging this day&apos;s workout.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddExercise}
                      className="text-xs text-lime-400 hover:underline font-bold flex items-center gap-1"
                    >
                      <Plus weight="bold" className="w-3.5 h-3.5" />
                      Add Exercise
                    </button>
                  </div>

                  <div className="space-y-3">
                    {(currentDayItem.exercises || []).map((ex, exIdx) => (
                      <div
                        key={exIdx}
                        className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            placeholder="Exercise name (e.g. Bench Press)"
                            value={ex.exerciseName}
                            onChange={e => {
                              const exercises = [...(currentDayItem.exercises || [])];
                              exercises[exIdx] = { ...exercises[exIdx], exerciseName: e.target.value };
                              updateCurrentDay({ exercises });
                            }}
                            className={`${INPUT} font-bold text-white`}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveExercise(exIdx)}
                            className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg shrink-0"
                            title="Remove Exercise"
                          >
                            <Trash weight="bold" className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Planned Sets for this Exercise */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold uppercase tracking-wider px-1">
                            <span>Sets & Targets</span>
                            <button
                              type="button"
                              onClick={() => handleAddSet(exIdx)}
                              className="text-lime-400 hover:underline"
                            >
                              + Add Set
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {ex.sets.map((set, sIdx) => (
                              <div
                                key={sIdx}
                                className="p-2 bg-zinc-950/80 border border-zinc-800 rounded-xl flex items-center justify-between gap-2"
                              >
                                <span className="text-[11px] font-mono font-bold text-lime-400 shrink-0">
                                  Set {set.setNumber}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min="1"
                                    placeholder="Reps"
                                    value={set.plannedReps}
                                    onChange={e => {
                                      const exercises = [...(currentDayItem.exercises || [])];
                                      exercises[exIdx].sets[sIdx].plannedReps = Number(e.target.value);
                                      updateCurrentDay({ exercises });
                                    }}
                                    className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs font-mono text-center"
                                  />
                                  <span className="text-[10px] text-zinc-500 font-mono">×</span>
                                  <input
                                    type="number"
                                    step="0.5"
                                    placeholder="KG"
                                    value={set.plannedWeightKg ?? ""}
                                    onChange={e => {
                                      const exercises = [...(currentDayItem.exercises || [])];
                                      exercises[exIdx].sets[sIdx].plannedWeightKg = e.target.value ? Number(e.target.value) : null;
                                      updateCurrentDay({ exercises });
                                    }}
                                    className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs font-mono text-center"
                                  />
                                  <span className="text-[10px] text-zinc-500 font-mono">kg</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSet(exIdx, sIdx)}
                                  disabled={ex.sets.length <= 1}
                                  className="text-zinc-600 hover:text-red-400 disabled:opacity-20 p-1"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="pt-3 flex items-center justify-between border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl text-xs transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-lime-400/20"
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
            ) : (
              <Check weight="bold" className="w-4 h-4" />
            )}
            <span>Save Weekly Schedule</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ==============================================================================
// 2B. WORKOUT SESSION RECORDING MODAL (Excel-Like Multi-Set Comparison)
// ==============================================================================
interface SessionExerciseRow {
  id?: string;
  exerciseName: string;
  notes: string;
  sets: Array<{
    setNumber: number;
    plannedReps: number;
    plannedWeightKg: number | string;
    actualReps: number | string;
    actualWeightKg: number | string;
    isCompleted: boolean;
  }>;
}

function WorkoutSessionRecordingModal({
  trainerId,
  assignedMembers,
  initialCustomerId,
  sessionToEdit,
  onClose,
  onSaved,
}: {
  trainerId: string;
  assignedMembers: AssignedMemberItem[];
  initialCustomerId: string | null;
  sessionToEdit: WorkoutPlanWithExercises | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [targetCustomerId, setTargetCustomerId] = useState<string>(
    sessionToEdit?.customerId || initialCustomerId || (assignedMembers.length > 0 ? assignedMembers[0].customer_id : "")
  );

  // Auto-detected today's date in local gym timezone (Africa/Addis_Ababa, UTC+3)
  const todayDate = useMemo(() => getGymTodayDate(), []);
  const todayWeekday = useMemo(() => getGymTodayWeekday(), []);

  const [workoutDate, setWorkoutDate] = useState<string>(
    sessionToEdit?.workoutDate || sessionToEdit?.startDate || todayDate
  );
  const [workoutTitle, setWorkoutTitle] = useState<string>(sessionToEdit?.title || "");
  const [isCompleted, setIsCompleted] = useState<boolean>(Boolean(sessionToEdit?.isCompleted));
  const [existingSessionId, setExistingSessionId] = useState<string | undefined>(sessionToEdit?.id);
  const [isRestDayNotice, setIsRestDayNotice] = useState<boolean>(false);

  const [memberSchedule, setMemberSchedule] = useState<MemberWeeklyScheduleItem[]>([]);
  const [historicalSessions, setHistoricalSessions] = useState<WorkoutPlan[]>([]);
  const [exercises, setExercises] = useState<SessionExerciseRow[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Initialize session: Auto-detect today's assigned workout, load existing session to prevent duplicate,
  // and load past sessions for Excel-like column comparison
  useEffect(() => {
    if (!targetCustomerId) return;
    let mounted = true;
    setLoading(true);

    async function initSession() {
      try {
        const [todayInfo, history, sched] = await Promise.all([
          fetchTodayAssignedWorkout(targetCustomerId, trainerId),
          fetchMemberWorkoutHistoryForComparison(targetCustomerId, 5),
          fetchMemberWeeklySchedule(targetCustomerId, trainerId),
        ]);

        if (!mounted) return;
        setMemberSchedule(sched);
        setHistoricalSessions(history);

        // 1. If editing an existing session or an existing session was found today:
        const session = sessionToEdit || todayInfo.existingSession;
        if (session) {
          setExistingSessionId(session.id);
          setWorkoutDate(session.workoutDate || session.startDate || todayDate);
          setWorkoutTitle(session.title);
          setIsCompleted(Boolean(session.isCompleted));
          setIsRestDayNotice(false);

          if (session.exercises && session.exercises.length > 0) {
            setExercises(
              session.exercises.map(e => ({
                id: e.id,
                exerciseName: e.exerciseName || e.exercise_name || "",
                notes: e.notes || e.instructions || "",
                sets:
                  Array.isArray(e.setsData) && e.setsData.length > 0
                    ? e.setsData.map(s => ({
                        setNumber: s.setNumber,
                        plannedReps: s.plannedReps,
                        plannedWeightKg: s.plannedWeightKg != null ? s.plannedWeightKg : "",
                        actualReps: s.actualReps != null ? s.actualReps : "",
                        actualWeightKg: s.actualWeightKg != null ? s.actualWeightKg : "",
                        isCompleted: Boolean(s.isCompleted),
                      }))
                    : [
                        {
                          setNumber: 1,
                          plannedReps: Number(e.plannedReps ?? e.planned_reps ?? e.reps ?? 10),
                          plannedWeightKg:
                            e.plannedWeightKg != null ? e.plannedWeightKg : e.planned_weight_kg != null ? e.planned_weight_kg : "",
                          actualReps:
                            e.actualReps != null ? e.actualReps : e.actual_reps != null ? e.actual_reps : "",
                          actualWeightKg:
                            e.actualWeightKg != null ? e.actualWeightKg : e.actual_weight_kg != null ? e.actual_weight_kg : "",
                          isCompleted: Boolean(e.isCompleted ?? e.is_completed),
                        },
                      ],
              }))
            );
          }
        } else {
          // 2. New session: auto-load today's assigned workout from weekly plan
          setExistingSessionId(undefined);
          setWorkoutDate(todayDate);

          const todaySched = todayInfo.scheduleItem;
          if (todaySched) {
            setWorkoutTitle(todaySched.workoutTitle);
            setIsRestDayNotice(Boolean(todaySched.isRestDay));

            if (todaySched.isRestDay || !todaySched.exercises || todaySched.exercises.length === 0) {
              setExercises([]);
            } else {
              setExercises(
                todaySched.exercises.map(e => ({
                  exerciseName: e.exerciseName,
                  notes: e.notes || "",
                  sets:
                    e.sets && e.sets.length > 0
                      ? e.sets.map(s => ({
                          setNumber: s.setNumber,
                          plannedReps: s.plannedReps,
                          plannedWeightKg: s.plannedWeightKg != null ? s.plannedWeightKg : "",
                          actualReps: "",
                          actualWeightKg: "",
                          isCompleted: false,
                        }))
                      : [
                          { setNumber: 1, plannedReps: 12, plannedWeightKg: 50, actualReps: "", actualWeightKg: "", isCompleted: false },
                          { setNumber: 2, plannedReps: 10, plannedWeightKg: 60, actualReps: "", actualWeightKg: "", isCompleted: false },
                          { setNumber: 3, plannedReps: 8, plannedWeightKg: 70, actualReps: "", actualWeightKg: "", isCompleted: false },
                        ],
                }))
              );
            }
          } else {
            setWorkoutTitle("Push (Chest, Shoulders & Triceps)");
            setExercises([
              {
                exerciseName: "Barbell Bench Press",
                notes: "Controlled eccentrics, pause at chest",
                sets: [
                  { setNumber: 1, plannedReps: 12, plannedWeightKg: 50, actualReps: "", actualWeightKg: "", isCompleted: false },
                  { setNumber: 2, plannedReps: 10, plannedWeightKg: 60, actualReps: "", actualWeightKg: "", isCompleted: false },
                  { setNumber: 3, plannedReps: 8, plannedWeightKg: 70, actualReps: "", actualWeightKg: "", isCompleted: false },
                ],
              },
            ]);
          }
        }
      } catch (err) {
        console.error("Session init error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void initSession();
    return () => {
      mounted = false;
    };
  }, [targetCustomerId, trainerId, sessionToEdit, todayDate]);

  // Switch session routine without modifying weekly schedule
  const handleSwitchRoutine = (dayItem: MemberWeeklyScheduleItem) => {
    setWorkoutTitle(dayItem.workoutTitle);
    setIsRestDayNotice(Boolean(dayItem.isRestDay));

    if (dayItem.exercises && dayItem.exercises.length > 0) {
      setExercises(
        dayItem.exercises.map(e => ({
          exerciseName: e.exerciseName,
          notes: e.notes || "",
          sets: e.sets.map(s => ({
            setNumber: s.setNumber,
            plannedReps: s.plannedReps,
            plannedWeightKg: s.plannedWeightKg != null ? s.plannedWeightKg : "",
            actualReps: "",
            actualWeightKg: "",
            isCompleted: false,
          })),
        }))
      );
    } else {
      setExercises([]);
    }
    toast.success(`Switched workout to "${dayItem.workoutTitle}" for this session.`);
  };

  const handleApplyTemplate = (tpl: typeof WORKOUT_TEMPLATES[0]) => {
    setWorkoutTitle(tpl.name);
    setIsRestDayNotice(false);
    setExercises(
      tpl.entries.map(e => ({
        exerciseName: e.exerciseName,
        notes: `Focus on form for ${e.exerciseName}`,
        sets: [
          { setNumber: 1, plannedReps: e.reps, plannedWeightKg: "", actualReps: "", actualWeightKg: "", isCompleted: false },
          { setNumber: 2, plannedReps: e.reps, plannedWeightKg: "", actualReps: "", actualWeightKg: "", isCompleted: false },
          { setNumber: 3, plannedReps: e.reps, plannedWeightKg: "", actualReps: "", actualWeightKg: "", isCompleted: false },
        ],
      }))
    );
    toast.success(`Template "${tpl.name}" loaded for this session.`);
  };

  const handleAddExercise = () => {
    setExercises(prev => [
      ...prev,
      {
        exerciseName: "",
        notes: "",
        sets: [
          { setNumber: 1, plannedReps: 12, plannedWeightKg: 50, actualReps: "", actualWeightKg: "", isCompleted: false },
          { setNumber: 2, plannedReps: 10, plannedWeightKg: 60, actualReps: "", actualWeightKg: "", isCompleted: false },
          { setNumber: 3, plannedReps: 8, plannedWeightKg: 70, actualReps: "", actualWeightKg: "", isCompleted: false },
        ],
      },
    ]);
  };

  const handleRemoveExercise = (idx: number) => {
    setExercises(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddSet = (exIdx: number) => {
    setExercises(prev =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const last = ex.sets[ex.sets.length - 1];
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              setNumber: ex.sets.length + 1,
              plannedReps: last?.plannedReps ?? 10,
              plannedWeightKg: last?.plannedWeightKg ?? "",
              actualReps: "",
              actualWeightKg: "",
              isCompleted: false,
            },
          ],
        };
      })
    );
  };

  const handleRemoveSet = (exIdx: number, sIdx: number) => {
    setExercises(prev =>
      prev.map((ex, i) => {
        if (i !== exIdx || ex.sets.length <= 1) return ex;
        return {
          ...ex,
          sets: ex.sets.filter((_, idx) => idx !== sIdx).map((s, idx) => ({ ...s, setNumber: idx + 1 })),
        };
      })
    );
  };

  const toggleSetDone = (exIdx: number, sIdx: number) => {
    setExercises(prev =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, idx) => (idx === sIdx ? { ...s, isCompleted: !s.isCompleted } : s)),
        };
      })
    );
  };

  // Up to 3 past sessions for horizontal Excel-like comparison columns
  const comparisonSessions = useMemo(() => {
    return historicalSessions
      .filter(s => s.id !== existingSessionId && (s.workoutDate || s.startDate) !== workoutDate)
      .slice(0, 3);
  }, [historicalSessions, existingSessionId, workoutDate]);

  // Single Save Workflow (Persist, notify, update history, no draft/in-progress state)
  const handleSaveSession = async () => {
    if (!workoutTitle.trim()) {
      toast.error("Please enter a workout title / focus.");
      return;
    }
    const validExercises = exercises.filter(e => e.exerciseName.trim());
    if (validExercises.length === 0) {
      toast.error("Please provide at least one exercise row.");
      return;
    }

    setSaving(true);
    try {
      const formattedExercises = validExercises.map(ex => ({
        id: ex.id,
        exerciseName: ex.exerciseName.trim(),
        notes: ex.notes.trim() || undefined,
        setsData: ex.sets.map(s => ({
          setNumber: s.setNumber,
          plannedReps: Number(s.plannedReps) || 10,
          plannedWeightKg: s.plannedWeightKg !== "" && !isNaN(Number(s.plannedWeightKg)) ? Number(s.plannedWeightKg) : null,
          actualReps: s.actualReps !== "" && !isNaN(Number(s.actualReps)) ? Number(s.actualReps) : null,
          actualWeightKg: s.actualWeightKg !== "" && !isNaN(Number(s.actualWeightKg)) ? Number(s.actualWeightKg) : null,
          isCompleted: Boolean(s.isCompleted),
        })),
      }));

      await saveDigitalWorkoutLog({
        id: existingSessionId,
        customerId: targetCustomerId,
        trainerId,
        title: workoutTitle.trim(),
        workoutDate,
        isCompleted,
        status: "PUBLISHED",
        exercises: formattedExercises,
      });

      toast.success(
        existingSessionId
          ? "Workout session updated and synced with member!"
          : "Workout session saved and published to member!"
      );
      onSaved();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to save workout session.");
    } finally {
      setSaving(false);
    }
  };

  const selectedMemberName = assignedMembers.find(m => m.customer_id === targetCustomerId)?.customer_name || "Member";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 w-full max-w-5xl max-h-[92vh] flex flex-col space-y-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center text-lime-400">
              <Barbell weight="fill" className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-black text-white text-base">
                  {existingSessionId ? "Edit Workout Session" : "Log Today's Workout Session"}
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-lime-400/20 text-lime-400 border border-lime-400/30">
                  {todayWeekday}, {workoutDate} (Local Gym UTC+3)
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Member: <strong>{selectedMemberName}</strong> · Excel-like comparison against previous sessions with independent Planned vs Actual sets.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-lg">
            <X weight="bold" className="w-5 h-5" />
          </button>
        </div>

        {/* Member Selector if multiple */}
        {assignedMembers.length > 1 && !existingSessionId && (
          <div>
            <label className={LABEL}>Assigned Member</label>
            <select
              value={targetCustomerId}
              onChange={e => setTargetCustomerId(e.target.value)}
              className={INPUT}
            >
              {assignedMembers.map(m => (
                <option key={m.customer_id} value={m.customer_id}>
                  {m.customer_name} ({m.customer_code || "Member"})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Workout Routine Switcher (Allows changing workout without changing weekly schedule) */}
        <div className="bg-zinc-950/70 border border-zinc-800 rounded-2xl p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-zinc-300 font-semibold flex items-center gap-1.5">
              <Lightning weight="bold" className="w-3.5 h-3.5 text-lime-400" />
              Switch Session Workout (Does not alter weekly schedule):
            </span>
            <div className="flex flex-wrap gap-1">
              {WORKOUT_TEMPLATES.slice(0, 3).map(tpl => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => handleApplyTemplate(tpl)}
                  className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-semibold border border-zinc-700"
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {memberSchedule.map(dayItem => {
              const isSelected = workoutTitle === dayItem.workoutTitle;
              return (
                <button
                  key={dayItem.dayOfWeek}
                  type="button"
                  onClick={() => handleSwitchRoutine(dayItem)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-lime-400 text-zinc-950 border-lime-400 shadow-sm"
                      : "bg-zinc-850 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  <span className="font-mono text-[10px] opacity-75">{dayItem.dayOfWeek.slice(0, 3)}:</span>
                  <span>{dayItem.isRestDay ? "Rest Day" : dayItem.workoutTitle}</span>
                </button>
              );
            })}
          </div>

          {isRestDayNotice && (
            <div className="p-2.5 rounded-xl bg-amber-400/10 border border-amber-400/25 text-amber-300 text-xs flex items-center justify-between gap-2">
              <span>
                Today ({todayWeekday}) is scheduled as <strong>Rest Day</strong> for {selectedMemberName}. You can select any workout routine above to log a workout.
              </span>
              <button
                type="button"
                onClick={() => {
                  const firstWork = memberSchedule.find(s => !s.isRestDay) || memberSchedule[0];
                  if (firstWork) handleSwitchRoutine(firstWork);
                }}
                className="px-2.5 py-1 bg-amber-400 text-zinc-950 font-bold rounded-lg text-[11px] shrink-0"
              >
                Switch to Workout
              </button>
            </div>
          )}
        </div>

        {/* Session Focus & Complete Workout Toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-2xl">
          <div className="sm:col-span-8">
            <label className={LABEL}>Workout Title / Focus *</label>
            <input
              type="text"
              required
              placeholder="e.g. Push (Chest, Shoulders & Triceps)"
              value={workoutTitle}
              onChange={e => setWorkoutTitle(e.target.value)}
              className={INPUT}
            />
          </div>

          <div className="sm:col-span-4 flex flex-col justify-end">
            <button
              type="button"
              onClick={() => setIsCompleted(!isCompleted)}
              className={`w-full py-2 px-3 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-2 ${
                isCompleted
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-zinc-800 text-zinc-400 border-zinc-700"
              }`}
            >
              <CheckCircle weight={isCompleted ? "fill" : "regular"} className="w-4 h-4 text-lime-400" />
              <span>Complete Workout: {isCompleted ? "Yes" : "No"}</span>
            </button>
          </div>
        </div>

        {/* Excel-Like Multi-Set Workout Recording Table with In-Place History */}
        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
          <div className="flex items-center justify-between">
            <div>
              <label className={LABEL}>
                Exercise Multi-Set Log ({exercises.length} Exercises)
              </label>
              <span className="text-[11px] text-zinc-500 block">
                Historical performance columns appear alongside today&apos;s inputs. Planned and actual values are stored separately per set.
              </span>
            </div>
            <button
              type="button"
              onClick={handleAddExercise}
              className="text-xs text-lime-400 hover:underline font-bold flex items-center gap-1"
            >
              <Plus weight="bold" className="w-3.5 h-3.5" />
              Add Exercise
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-zinc-500">
              <div className="w-6 h-6 border-2 border-lime-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading workout details and history...
            </div>
          ) : exercises.length === 0 ? (
            <div className="py-10 text-center text-zinc-500 bg-zinc-950/60 rounded-2xl border border-zinc-800">
              <Barbell className="w-10 h-10 mx-auto text-zinc-700 mb-2" />
              <p className="text-sm font-semibold text-zinc-400">No exercises in this session</p>
              <button
                type="button"
                onClick={handleAddExercise}
                className="mt-2 text-xs bg-lime-400 text-zinc-950 font-bold px-3 py-1.5 rounded-xl hover:bg-lime-300"
              >
                + Add First Exercise
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {exercises.map((ex, exIdx) => (
                <div
                  key={exIdx}
                  className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-3.5 space-y-3 shadow-sm"
                >
                  {/* Exercise Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-lime-400 px-2 py-0.5 rounded bg-lime-400/10">
                        #{exIdx + 1}
                      </span>
                      <input
                        type="text"
                        placeholder="Exercise name (e.g. Bench Press)"
                        value={ex.exerciseName}
                        onChange={e => {
                          const val = e.target.value;
                          setExercises(prev =>
                            prev.map((it, i) => (i === exIdx ? { ...it, exerciseName: val } : it))
                          );
                        }}
                        className={`${INPUT} font-bold text-white max-w-sm`}
                      />
                      <input
                        type="text"
                        placeholder="Notes / instructions (e.g. pause at bottom)"
                        value={ex.notes}
                        onChange={e => {
                          const val = e.target.value;
                          setExercises(prev =>
                            prev.map((it, i) => (i === exIdx ? { ...it, notes: val } : it))
                          );
                        }}
                        className={`${INPUT} text-xs text-zinc-300`}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddSet(exIdx)}
                        className="text-xs text-lime-400 hover:text-lime-300 font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700"
                      >
                        <Plus weight="bold" className="w-3 h-3" />
                        Add Set
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveExercise(exIdx)}
                        className="p-1 text-zinc-500 hover:text-red-400 rounded-lg"
                        title="Remove Exercise"
                      >
                        <Trash weight="bold" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Excel-Like Table: Set # | Past Session 1 | Past Session 2 | Past Session 3 | Today (Editable) */}
                  <div className="overflow-x-auto rounded-xl border border-zinc-800/70 bg-zinc-900/50">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900 text-[10px] uppercase font-bold text-zinc-400">
                          <th className="py-2 px-3 text-center w-14">Set #</th>
                          {/* Historical Session Columns */}
                          {comparisonSessions.map(comp => (
                            <th
                              key={comp.id}
                              className="py-2 px-3 text-center bg-zinc-850/80 font-mono text-zinc-300 border-x border-zinc-800 min-w-[120px]"
                            >
                              {new Date(comp.workoutDate || comp.startDate || comp.createdAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                              <span className="block text-[9px] text-zinc-500 font-normal">Past Performance</span>
                            </th>
                          ))}
                          {comparisonSessions.length === 0 && (
                            <th className="py-2 px-3 text-center bg-zinc-850/50 text-zinc-500 font-mono text-[10px] min-w-[120px]">
                              No Past Sessions
                            </th>
                          )}
                          {/* Today Column (Editable Inputs) */}
                          <th className="py-2 px-3 text-center bg-lime-400/10 text-lime-400 border-l border-lime-400/30 min-w-[320px]">
                            Today ({workoutDate}) — Planned vs Actual
                          </th>
                          <th className="py-2 px-2 text-center w-12">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {ex.sets.map((set, sIdx) => (
                          <tr key={sIdx} className="hover:bg-zinc-850/30">
                            {/* Set # */}
                            <td className="py-2 px-3 text-center font-mono font-bold text-lime-400">
                              Set {set.setNumber}
                            </td>

                            {/* Historical Columns */}
                            {comparisonSessions.map(comp => {
                              const compEx = comp.exercises.find(
                                e => (e.exerciseName || e.exercise_name || "").toLowerCase().trim() === ex.exerciseName.toLowerCase().trim()
                              );
                              const compSet =
                                compEx?.setsData?.find(s => s.setNumber === set.setNumber) ||
                                (compEx?.setsData && compEx.setsData[sIdx]) ||
                                (compEx && set.setNumber === 1
                                  ? {
                                      actualWeightKg: compEx.actualWeightKg,
                                      actualReps: compEx.actualReps,
                                      plannedWeightKg: compEx.plannedWeightKg,
                                      plannedReps: compEx.plannedReps,
                                    }
                                  : null);

                              const hasData = compSet && (compSet.actualWeightKg != null || compSet.actualReps != null || compSet.plannedWeightKg != null);
                              const weight = compSet?.actualWeightKg ?? compSet?.plannedWeightKg;
                              const reps = compSet?.actualReps ?? compSet?.plannedReps;

                              return (
                                <td
                                  key={comp.id}
                                  className="py-2 px-3 text-center font-mono text-xs border-x border-zinc-800/60 bg-zinc-950/30"
                                >
                                  {hasData ? (
                                    <span className="inline-block px-2 py-0.5 rounded bg-zinc-800/90 text-zinc-200 font-bold border border-zinc-700/60">
                                      {weight != null ? `${weight}kg` : "BW"} × {reps ?? "—"}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-600">—</span>
                                  )}
                                </td>
                              );
                            })}
                            {comparisonSessions.length === 0 && (
                              <td className="py-2 px-3 text-center text-zinc-600 font-mono text-xs">
                                —
                              </td>
                            )}

                            {/* Today Column: Independently Editable Planned and Actual values */}
                            <td className="py-2 px-3 bg-lime-400/5 border-l border-lime-400/20">
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                {/* Planned Prescription */}
                                <div className="flex items-center gap-1 bg-cyan-400/10 border border-cyan-400/20 rounded-lg px-2 py-1">
                                  <span className="text-[10px] font-bold text-cyan-400 uppercase font-mono">Plan:</span>
                                  <input
                                    type="number"
                                    step="0.5"
                                    placeholder="KG"
                                    value={set.plannedWeightKg}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setExercises(prev =>
                                        prev.map((item, i) =>
                                          i !== exIdx
                                            ? item
                                            : {
                                                ...item,
                                                sets: item.sets.map((s, idx) =>
                                                  idx === sIdx ? { ...s, plannedWeightKg: val } : s
                                                ),
                                              }
                                        )
                                      );
                                    }}
                                    className="w-14 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-white font-mono text-xs text-center"
                                  />
                                  <span className="text-[10px] text-zinc-400 font-mono">kg ×</span>
                                  <input
                                    type="number"
                                    min="1"
                                    placeholder="Reps"
                                    value={set.plannedReps}
                                    onChange={e => {
                                      const val = Number(e.target.value);
                                      setExercises(prev =>
                                        prev.map((item, i) =>
                                          i !== exIdx
                                            ? item
                                            : {
                                                ...item,
                                                sets: item.sets.map((s, idx) =>
                                                  idx === sIdx ? { ...s, plannedReps: val } : s
                                                ),
                                              }
                                        )
                                      );
                                    }}
                                    className="w-12 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-white font-mono text-xs text-center"
                                  />
                                </div>

                                {/* Actual Performance */}
                                <div className="flex items-center gap-1 bg-lime-400/10 border border-lime-400/20 rounded-lg px-2 py-1">
                                  <span className="text-[10px] font-bold text-lime-400 uppercase font-mono">Act:</span>
                                  <input
                                    type="number"
                                    step="0.5"
                                    placeholder="KG"
                                    value={set.actualWeightKg}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setExercises(prev =>
                                        prev.map((item, i) =>
                                          i !== exIdx
                                            ? item
                                            : {
                                                ...item,
                                                sets: item.sets.map((s, idx) =>
                                                  idx === sIdx ? { ...s, actualWeightKg: val } : s
                                                ),
                                              }
                                        )
                                      );
                                    }}
                                    className="w-14 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-white font-mono text-xs text-center font-bold text-lime-300"
                                  />
                                  <span className="text-[10px] text-zinc-400 font-mono">kg ×</span>
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="Reps"
                                    value={set.actualReps}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setExercises(prev =>
                                        prev.map((item, i) =>
                                          i !== exIdx
                                            ? item
                                            : {
                                                ...item,
                                                sets: item.sets.map((s, idx) =>
                                                  idx === sIdx ? { ...s, actualReps: val } : s
                                                ),
                                              }
                                        )
                                      );
                                    }}
                                    className="w-12 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-white font-mono text-xs text-center font-bold text-lime-300"
                                  />
                                </div>

                                {/* Done Toggle */}
                                <button
                                  type="button"
                                  onClick={() => toggleSetDone(exIdx, sIdx)}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors flex items-center gap-1 ${
                                    set.isCompleted
                                      ? "bg-lime-400 text-zinc-950 border-lime-400"
                                      : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                                  }`}
                                >
                                  <CheckCircle weight={set.isCompleted ? "fill" : "regular"} className="w-3 h-3" />
                                  <span>{set.isCompleted ? "Done" : "Pending"}</span>
                                </button>
                              </div>
                            </td>

                            {/* Remove Set */}
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveSet(exIdx, sIdx)}
                                disabled={ex.sets.length <= 1}
                                className="text-zinc-600 hover:text-red-400 disabled:opacity-20 p-1"
                                title="Remove set"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
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

        {/* Modal Actions: Simple Save Workflow (Single Save button, no draft/in-progress) */}
        <div className="pt-3 flex items-center justify-between border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl text-xs transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSaveSession}
            disabled={saving}
            className="px-6 py-2.5 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-lime-400/20"
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
            ) : (
              <Check weight="bold" className="w-4 h-4" />
            )}
            <span>{existingSessionId ? "Update Workout Session" : "Save Workout Session"}</span>
          </button>
        </div>
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
