import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  ChalkboardTeacher,
  Users,
  Clock,
  CheckCircle,
  X,
  NotePencil,
  WarningCircle,
  ArrowClockwise,
  Plus,
  Play,
  Trash,
  VideoCamera,
  ForkKnife,
  Barbell,
  TrendUp,
  CalendarCheck,
  IdentificationBadge,
  Sparkle,
  UploadSimple,
  Check,
  MagnifyingGlass,
  Warning,
} from "@phosphor-icons/react";
import { useGym } from "../context/GymContext";
import {
  fetchTrainerProfileData,
  type TrainerProfileState,
  type RealTrainerProfile,
} from "../services/trainerProfileService";
import {
  fetchAssignedMembers,
  fetchTrainerDashboardOverview,
  fetchWorkoutPlans,
  saveWorkoutPlan,
  fetchMealPlans,
  saveMealPlan,
  fetchMemberProgress,
  recordMemberProgress,
  fetchPersonalTrainingSessions,
  recordCompletedPersonalTrainingSession,
  fetchMemberAttendanceHistory,
  fetchTrainerExerciseVideos,
  uploadExerciseVideo,
  deleteExerciseVideo,
  getVideoSignedUrl,
  type AssignedMemberItem,
  type TrainerDashboardOverviewResult,
  type WorkoutPlanWithExercises,
  type MealPlanWithItems,
  type MemberProgressRecord,
  type PersonalTrainingSessionItem,
  type MemberAttendanceCombinedItem,
  type ExerciseVideo,
} from "../services/personalTrainerService";
import {
  fetchTrainerNotes,
  createTrainerNote,
  type TrainerCoachingNote,
} from "../services/trainerNotesService";
import { toast } from "sonner";

const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-6";
const INPUT =
  "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50 transition-colors text-sm";
const LABEL = "block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5";

type PortalTab = "overview" | "members" | "videos" | "profile";
type MemberTab = "workouts" | "meals" | "attendance" | "progress" | "notes";

// Predefined Workout Templates for Trainers
const WORKOUT_TEMPLATES = [
  {
    name: "Full Body Hypertrophy",
    description: "Compound and accessory exercises targeting all major muscle groups.",
    exercises: [
      { exercise_name: "Barbell Squats", sets: 4, reps: "10-12", duration_seconds: null, rest_interval_seconds: 90, instructions: "Deep squats, control the eccentric phase", day_of_week: "Monday" },
      { exercise_name: "Dumbbell Bench Press", sets: 4, reps: "10-12", duration_seconds: null, rest_interval_seconds: 90, instructions: "Full stretch at bottom, squeeze chest at top", day_of_week: "Monday" },
      { exercise_name: "Seated Cable Rows", sets: 3, reps: "12", duration_seconds: null, rest_interval_seconds: 60, instructions: "Keep back straight, drive elbows back", day_of_week: "Wednesday" },
      { exercise_name: "Romanian Deadlifts", sets: 3, reps: "10-12", duration_seconds: null, rest_interval_seconds: 90, instructions: "Hinge at the hips, feel hamstring stretch", day_of_week: "Wednesday" },
      { exercise_name: "Standing Overhead Press", sets: 3, reps: "10", duration_seconds: null, rest_interval_seconds: 75, instructions: "Brace core, press overhead without arching back", day_of_week: "Friday" },
      { exercise_name: "Hanging Leg Raises", sets: 3, reps: "15", duration_seconds: null, rest_interval_seconds: 60, instructions: "Control swing, initiate pull from core", day_of_week: "Friday" },
    ],
  },
  {
    name: "Strength & Power (3-Day Split)",
    description: "Strength focused program with progressive overload on core compound lifts.",
    exercises: [
      { exercise_name: "Barbell Back Squats", sets: 5, reps: "5", duration_seconds: null, rest_interval_seconds: 120, instructions: "Heavy compound squat, maintain brace", day_of_week: "Monday" },
      { exercise_name: "Barbell Bench Press", sets: 5, reps: "5", duration_seconds: null, rest_interval_seconds: 120, instructions: "Arch upper back, pause briefly on chest", day_of_week: "Monday" },
      { exercise_name: "Conventional Deadlift", sets: 4, reps: "5", duration_seconds: null, rest_interval_seconds: 150, instructions: "Engage lats, push floor away", day_of_week: "Wednesday" },
      { exercise_name: "Military Shoulder Press", sets: 4, reps: "6", duration_seconds: null, rest_interval_seconds: 90, instructions: "Strict standing form", day_of_week: "Wednesday" },
      { exercise_name: "Barbell Pendlay Rows", sets: 4, reps: "6-8", duration_seconds: null, rest_interval_seconds: 90, instructions: "Explosive pull from floor", day_of_week: "Friday" },
      { exercise_name: "Weighted Dips", sets: 3, reps: "8", duration_seconds: null, rest_interval_seconds: 90, instructions: "Lean forward slightly for chest focus", day_of_week: "Friday" },
    ],
  },
  {
    name: "Fat Loss & Conditioning Circuit",
    description: "High intensity resistance and functional circuit training for metabolic conditioning.",
    exercises: [
      { exercise_name: "Kettlebell Swings", sets: 4, reps: "20", duration_seconds: 45, rest_interval_seconds: 45, instructions: "Hinge hips with power, keep arms relaxed", day_of_week: "Tuesday" },
      { exercise_name: "Goblet Squats", sets: 4, reps: "15", duration_seconds: 45, rest_interval_seconds: 45, instructions: "Hold dumbbell at chest level", day_of_week: "Tuesday" },
      { exercise_name: "Push-ups to Renegade Row", sets: 3, reps: "12", duration_seconds: 45, rest_interval_seconds: 60, instructions: "Maintain plank stability without twisting", day_of_week: "Thursday" },
      { exercise_name: "Assault Bike Intervals", sets: 5, reps: "N/A", duration_seconds: 30, rest_interval_seconds: 60, instructions: "Maximum effort sprint intervals", day_of_week: "Thursday" },
      { exercise_name: "Plank Hold", sets: 3, reps: "N/A", duration_seconds: 60, rest_interval_seconds: 45, instructions: "Squeeze glutes and abs tight", day_of_week: "Saturday" },
    ],
  },
];

// Predefined Meal Plan Templates
const MEAL_TEMPLATES = [
  {
    name: "High Protein Muscle Building",
    daily_calories: 2600,
    notes: "Drink at least 3 liters of water daily. High biological value protein with complex carbs.",
    items: [
      { meal_type: "breakfast", food_name: "Scrambled Eggs (4) + Oats with Banana & Honey", portion: "4 whole eggs, 80g oats", instructions: "Cook eggs with minimal olive oil" },
      { meal_type: "lunch", food_name: "Grilled Chicken Breast with Brown Rice & Steamed Veggies", portion: "200g chicken, 150g rice", instructions: "Season with garlic, rosemary, and lemon" },
      { meal_type: "snack", food_name: "Greek Yogurt or Whey Shake + Handful of Almonds", portion: "1 scoop / 200g yogurt, 30g nuts", instructions: "Post-workout or mid-afternoon" },
      { meal_type: "dinner", food_name: "Tender Beef or Tilapia with Sweet Potato & Salad", portion: "200g fish/beef, 200g sweet potato", instructions: "Olive oil and vinegar dressing on mixed greens" },
    ],
  },
  {
    name: "Calorie Deficit & Fat Loss",
    daily_calories: 1800,
    notes: "Prioritize lean protein and high fiber vegetables to maintain fullness during deficit.",
    items: [
      { meal_type: "breakfast", food_name: "Egg Whites (3) + 1 Whole Egg + Spinach & 1 Slice Toast", portion: "3 whites, 1 egg, 1 slice toast", instructions: "Saute spinach in dry pan" },
      { meal_type: "lunch", food_name: "Grilled Chicken Salad with Avocado & Lemon Dressing", portion: "180g chicken, 1/4 avocado, mixed greens", instructions: "No mayonnaise or creamy dressing" },
      { meal_type: "snack", food_name: "Apple with 1 Tablespoon Natural Peanut Butter", portion: "1 medium apple, 15g peanut butter", instructions: "Stay hydrated with black coffee or green tea" },
      { meal_type: "dinner", food_name: "Baked White Fish with Roasted Broccoli & Cauliflower", portion: "220g fish, 200g vegetables", instructions: "Season generously with paprika and pepper" },
    ],
  },
];

export default function TrainerPortal() {
  const { state } = useGym();
  const [tab, setTab] = useState<PortalTab>("overview");
  const [profileState, setProfileState] = useState<TrainerProfileState>({ status: "loading" });
  const [overview, setOverview] = useState<TrainerDashboardOverviewResult | null>(null);
  const [assignedMembers, setAssignedMembers] = useState<AssignedMemberItem[]>([]);
  const [videos, setVideos] = useState<ExerciseVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected Member for detailed coaching view
  const [selectedMember, setSelectedMember] = useState<AssignedMemberItem | null>(null);

  // Video preview player
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  const [playingVideoTitle, setPlayingVideoTitle] = useState<string>("");

  // Video Upload Modal State
  const [showVideoUploadModal, setShowVideoUploadModal] = useState(false);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoNotes, setVideoNotes] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  // Search filter
  const [memberSearch, setMemberSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "EXPIRED">("ALL");

  const effectiveTrainerId = state.currentUser?.trainerId;
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

      // 2. Load Overview Metrics, Assigned Members, and Videos in parallel
      const [overviewData, membersData, videosData] = await Promise.all([
        fetchTrainerDashboardOverview(trainerId),
        fetchAssignedMembers(trainerId),
        fetchTrainerExerciseVideos(trainerId),
      ]);

      setOverview(overviewData);
      setAssignedMembers(membersData);
      setVideos(videosData);
    } catch (err: any) {
      console.error("[TrainerPortal] Error loading trainer data:", err);
      setError(err?.message || "Failed to load trainer dashboard data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    void loadAllTrainerData();
  }, [loadAllTrainerData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllTrainerData();
    toast.success("Trainer dashboard refreshed.");
  };

  const handlePlayVideo = async (video: ExerciseVideo) => {
    try {
      const signedUrl = await getVideoSignedUrl(video.storagePath);
      setPlayingVideoUrl(signedUrl);
      setPlayingVideoTitle(video.title);
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate video stream URL.");
    }
  };

  const handleDeleteVideo = async (video: ExerciseVideo) => {
    if (!confirm(`Are you sure you want to delete video "${video.title}"?`)) return;
    try {
      await deleteExerciseVideo(video.id, video.storagePath);
      toast.success("Exercise video deleted.");
      setVideos(prev => prev.filter(v => v.id !== video.id));
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete video.");
    }
  };

  const handleVideoUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile) {
      toast.error("Please select a video file to upload.");
      return;
    }
    if (!videoTitle.trim()) {
      toast.error("Please provide a title for the exercise video.");
      return;
    }

    const trainerId =
      profileState.status === "success" ? profileState.profile.id : effectiveTrainerId;
    if (!trainerId) {
      toast.error("Unable to identify current trainer profile.");
      return;
    }

    setIsUploadingVideo(true);
    try {
      const uploaded = await uploadExerciseVideo(
        trainerId,
        videoFile,
        videoTitle.trim(),
        videoNotes.trim() || undefined
      );

      toast.success("Exercise demonstration video uploaded successfully!");
      setVideos(prev => [uploaded, ...prev]);
      setShowVideoUploadModal(false);
      setVideoTitle("");
      setVideoNotes("");
      setVideoFile(null);
      if (videoInputRef.current) videoInputRef.current.value = "";
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload exercise video.");
    } finally {
      setIsUploadingVideo(false);
    }
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
    return (
      <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center p-4">
        <div className={`${CARD} max-w-md w-full text-center space-y-4`}>
          <div className="w-12 h-12 rounded-full bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto text-red-400">
            <Warning weight="fill" className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-white">Trainer Portal Access Error</h3>
          <p className="text-xs text-zinc-400">{error || (profileState as any).error}</p>
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
                Manage your assigned members, custom workout & nutrition plans, and track personal training sessions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVideoUploadModal(true)}
              className="bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors"
            >
              <VideoCamera weight="bold" className="w-4 h-4 text-lime-400" />
              Upload Demo Video
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

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-zinc-800/80 pb-3 overflow-x-auto">
          <button
            onClick={() => setTab("overview")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
              tab === "overview"
                ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
                : "bg-zinc-800/60 text-zinc-400 hover:text-white"
            }`}
          >
            <Sparkle weight="bold" className="w-4 h-4" />
            Dashboard Overview
          </button>
          <button
            onClick={() => setTab("members")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
              tab === "members"
                ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
                : "bg-zinc-800/60 text-zinc-400 hover:text-white"
            }`}
          >
            <Users weight="bold" className="w-4 h-4" />
            My Members ({assignedMembers.length})
          </button>
          <button
            onClick={() => setTab("videos")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
              tab === "videos"
                ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
                : "bg-zinc-800/60 text-zinc-400 hover:text-white"
            }`}
          >
            <VideoCamera weight="bold" className="w-4 h-4" />
            Exercise Videos ({videos.length})
          </button>
          <button
            onClick={() => setTab("profile")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
              tab === "profile"
                ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10"
                : "bg-zinc-800/60 text-zinc-400 hover:text-white"
            }`}
          >
            <IdentificationBadge weight="bold" className="w-4 h-4" />
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
                    <p className="text-xs text-zinc-400">Select any member to open their coaching plans</p>
                  </div>
                  <button
                    onClick={() => setTab("members")}
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
                        onClick={() => setSelectedMember(m)}
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
                  onChange={e => setStatusFilter(e.target.value as any)}
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
                            onClick={() => setSelectedMember(m)}
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

        {/* TAB 3: EXERCISE VIDEOS */}
        {tab === "videos" && (
          <div className="space-y-6">
            <div className={`${CARD} flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <VideoCamera weight="fill" className="w-5 h-5 text-lime-400" />
                  Exercise Demonstration Videos
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Securely stored in Supabase private bucket &apos;trainer-videos&apos;. Videos can be viewed via signed streaming URLs.
                </p>
              </div>
              <button
                onClick={() => setShowVideoUploadModal(true)}
                className="bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-colors self-start sm:self-auto"
              >
                <Plus weight="bold" className="w-4 h-4" />
                Upload Exercise Video
              </button>
            </div>

            {videos.length === 0 ? (
              <div className={`${CARD} py-16 text-center text-zinc-500`}>
                <VideoCamera className="w-12 h-12 mx-auto text-zinc-700 mb-2" />
                <p className="text-sm font-semibold text-zinc-400">No exercise videos uploaded yet</p>
                <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                  Upload video demonstrations of exercises (MP4, WebM, MOV) to attach to your member workout plans.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {videos.map(v => (
                  <div
                    key={v.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-zinc-700 transition-colors"
                  >
                    <div>
                      <div className="w-full h-36 bg-zinc-800/60 rounded-xl flex items-center justify-center relative overflow-hidden group cursor-pointer border border-zinc-800">
                        <div
                          onClick={() => handlePlayVideo(v)}
                          className="w-12 h-12 rounded-full bg-lime-400/90 group-hover:bg-lime-400 text-zinc-950 flex items-center justify-center transition-transform group-hover:scale-110 shadow-lg"
                        >
                          <Play weight="fill" className="w-5 h-5 ml-0.5" />
                        </div>
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-[10px] text-zinc-300 font-mono">
                          {((v.fileSizeBytes || 0) / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      </div>

                      <h4 className="font-bold text-white text-sm mt-3">{v.title}</h4>
                      {v.description && <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{v.description}</p>}
                    </div>

                    <div className="flex items-center justify-between border-t border-zinc-800/80 pt-2 text-[11px] text-zinc-500">
                      <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                      <button
                        onClick={() => handleDeleteVideo(v)}
                        className="text-red-400 hover:text-red-300 p-1.5 rounded hover:bg-zinc-800 transition-colors"
                        title="Delete video"
                      >
                        <Trash weight="bold" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                <video
                  src={playingVideoUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
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

        {/* Video Upload Modal */}
        {showVideoUploadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <VideoCamera weight="fill" className="w-5 h-5 text-lime-400" />
                  <h4 className="font-bold text-white text-base">Upload Exercise Video</h4>
                </div>
                <button
                  onClick={() => setShowVideoUploadModal(false)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <X weight="bold" className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleVideoUploadSubmit} className="space-y-4">
                <div>
                  <label className={LABEL}>Video Title <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Barbell Squat Form & Depth Guide"
                    value={videoTitle}
                    onChange={e => setVideoTitle(e.target.value)}
                    className={INPUT}
                  />
                </div>

                <div>
                  <label className={LABEL}>Coaching Notes / Instructions</label>
                  <textarea
                    rows={2}
                    placeholder="Key pointers: foot placement, bracing, knee tracking..."
                    value={videoNotes}
                    onChange={e => setVideoNotes(e.target.value)}
                    className={INPUT}
                  />
                </div>

                <div>
                  <label className={LABEL}>Video File (MP4, WebM, MOV &mdash; max 50MB) <span className="text-red-400">*</span></label>
                  <input
                    ref={videoInputRef}
                    type="file"
                    required
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={e => setVideoFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-lime-400 file:text-zinc-950 hover:file:bg-lime-300"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowVideoUploadModal(false)}
                    disabled={isUploadingVideo}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUploadingVideo || !videoFile}
                    className="flex-1 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    {isUploadingVideo ? (
                      <div className="w-3.5 h-3.5 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
                    ) : (
                      <UploadSimple weight="bold" className="w-4 h-4" />
                    )}
                    Upload Video
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MEMBER COACHING SUITE MODAL */}
        {selectedMember && (
          <MemberCoachingSuiteModal
            member={selectedMember}
            trainerProfile={trainerProfile}
            onClose={() => setSelectedMember(null)}
            onUpdated={loadAllTrainerData}
          />
        )}
      </div>
    </div>
  );
}

// ==============================================================================
// MEMBER COACHING SUITE MODAL
// Contains: Workouts, Meals, Attendance & Session Recording, Progress, Notes
// ==============================================================================
interface MemberCoachingSuiteModalProps {
  member: AssignedMemberItem;
  trainerProfile: RealTrainerProfile | null;
  onClose: () => void;
  onUpdated: () => void;
}

function MemberCoachingSuiteModal({
  member,
  trainerProfile,
  onClose,
  onUpdated,
}: MemberCoachingSuiteModalProps) {
  const [subTab, setSubTab] = useState<MemberTab>("workouts");
  const [loading, setLoading] = useState(true);

  // Data
  const [workouts, setWorkouts] = useState<WorkoutPlanWithExercises[]>([]);
  const [meals, setMeals] = useState<MealPlanWithItems[]>([]);
  const [attendance, setAttendance] = useState<MemberAttendanceCombinedItem[]>([]);
  const [ptSessions, setPtSessions] = useState<PersonalTrainingSessionItem[]>([]);
  const [progressRecords, setProgressRecords] = useState<MemberProgressRecord[]>([]);
  const [notes, setNotes] = useState<TrainerCoachingNote[]>([]);

  // Modals inside coaching suite
  const [showNewWorkoutModal, setShowNewWorkoutModal] = useState(false);
  const [showNewMealModal, setShowNewMealModal] = useState(false);
  const [showRecordSessionModal, setShowRecordSessionModal] = useState(false);
  const [showRecordProgressModal, setShowRecordProgressModal] = useState(false);

  // New Note state
  const [newNoteContent, setNewNoteContent] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  const loadMemberCoachingData = useCallback(async () => {
    setLoading(true);
    try {
      const [w, m, att, pt, prog, n] = await Promise.all([
        fetchWorkoutPlans(member.customer_id),
        fetchMealPlans(member.customer_id),
        fetchMemberAttendanceHistory(member.customer_id),
        fetchPersonalTrainingSessions(member.customer_id),
        fetchMemberProgress(member.customer_id),
        fetchTrainerNotes(member.customer_id),
      ]);
      setWorkouts(w);
      setMeals(m);
      setAttendance(att);
      setPtSessions(pt);
      setProgressRecords(prog);
      setNotes(n);
    } catch (err: any) {
      console.error("[MemberCoachingSuite] Error loading member coaching data:", err);
      toast.error("Failed to load some coaching records for member.");
    } finally {
      setLoading(false);
    }
  }, [member.customer_id]);

  useEffect(() => {
    void loadMemberCoachingData();
  }, [loadMemberCoachingData]);

  const handleAddCoachingNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim()) return;
    if (!trainerProfile?.id) {
      toast.error("Trainer profile not identified.");
      return;
    }

    setIsSavingNote(true);
    try {
      const added = await createTrainerNote({
        customerId: member.customer_id,
        trainerId: trainerProfile.id,
        workoutFocus: "Coaching Note",
        notes: newNoteContent.trim(),
      });
      setNotes(prev => [added, ...prev]);
      setNewNoteContent("");
      toast.success("Coaching note saved.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save note.");
    } finally {
      setIsSavingNote(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 bg-zinc-900/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-lime-400/10 border border-lime-400/30 flex items-center justify-center text-lime-400 font-black text-lg shrink-0">
              {member.customer_name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-white text-lg">{member.customer_name}</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-lime-400/20 text-lime-400 border border-lime-400/30">
                  {member.membership_status || "ACTIVE"}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-semibold">
                  {member.category}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2">
                <span>Code: <strong className="text-white">{member.customer_code}</strong></span>
                <span>·</span>
                <span>Phone: <strong className="text-white">{member.phone}</strong></span>
                <span>·</span>
                <span>Plan: <strong className="text-white">{member.plan_name || "Gym Access"}</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X weight="bold" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-Tab Navigation */}
        <div className="px-5 border-b border-zinc-800 bg-zinc-950/40 flex gap-2 overflow-x-auto py-2">
          <button
            onClick={() => setSubTab("workouts")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              subTab === "workouts"
                ? "bg-lime-400 text-zinc-950"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <Barbell weight="bold" className="w-4 h-4" />
            Workout Plans ({workouts.length})
          </button>
          <button
            onClick={() => setSubTab("meals")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              subTab === "meals"
                ? "bg-lime-400 text-zinc-950"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <ForkKnife weight="bold" className="w-4 h-4" />
            Meal Plans ({meals.length})
          </button>
          <button
            onClick={() => setSubTab("attendance")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              subTab === "attendance"
                ? "bg-lime-400 text-zinc-950"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <CalendarCheck weight="bold" className="w-4 h-4" />
            Attendance & PT Sessions ({attendance.length})
          </button>
          <button
            onClick={() => setSubTab("progress")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              subTab === "progress"
                ? "bg-lime-400 text-zinc-950"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <TrendUp weight="bold" className="w-4 h-4" />
            Progress Records ({progressRecords.length})
          </button>
          <button
            onClick={() => setSubTab("notes")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              subTab === "notes"
                ? "bg-lime-400 text-zinc-950"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <NotePencil weight="bold" className="w-4 h-4" />
            Coaching Notes ({notes.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {loading ? (
            <div className="py-12 text-center text-zinc-500">
              <div className="w-8 h-8 border-2 border-lime-400/20 border-t-lime-400 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs">Loading member data from database...</p>
            </div>
          ) : (
            <>
              {/* SUBTAB 1: WORKOUTS */}
              {subTab === "workouts" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm">Assigned Workout Plans</h4>
                      <p className="text-xs text-zinc-400">Custom exercise routines tailored for {member.customer_name}</p>
                    </div>
                    <button
                      onClick={() => setShowNewWorkoutModal(true)}
                      className="bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Plus weight="bold" className="w-3.5 h-3.5" />
                      Create Workout Plan
                    </button>
                  </div>

                  {workouts.length === 0 ? (
                    <div className="p-8 border border-zinc-800 rounded-xl text-center text-zinc-500 text-xs">
                      <Barbell className="w-10 h-10 mx-auto text-zinc-700 mb-2" />
                      No workout plan created yet for this member. Click &quot;Create Workout Plan&quot; to assign one.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {workouts.map(wp => (
                        <div
                          key={wp.id}
                          className="border border-zinc-800 rounded-xl p-4 bg-zinc-850/50 space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <h5 className="font-bold text-white text-sm">{wp.title}</h5>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  wp.status === "ACTIVE" ? "bg-lime-400/20 text-lime-400" : "bg-zinc-800 text-zinc-400"
                                }`}>
                                  {wp.status}
                                </span>
                              </div>
                              {wp.description && <p className="text-xs text-zinc-400 mt-0.5">{wp.description}</p>}
                            </div>
                            <span className="text-[11px] text-zinc-500 font-mono">
                              {wp.start_date} {wp.end_date ? `to ${wp.end_date}` : ""}
                            </span>
                          </div>

                          {/* Exercises Table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-500">
                                  <th className="pb-1 pl-1">Day / Session</th>
                                  <th className="pb-1">Exercise</th>
                                  <th className="pb-1">Sets</th>
                                  <th className="pb-1">Reps</th>
                                  <th className="pb-1">Rest</th>
                                  <th className="pb-1">Instructions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-800/40">
                                {wp.exercises.map(ex => (
                                  <tr key={ex.id}>
                                    <td className="py-2 pl-1 font-semibold text-lime-400">{ex.day_of_week || "Day 1"}</td>
                                    <td className="py-2 text-white font-medium">{ex.exercise_name}</td>
                                    <td className="py-2 text-zinc-300 font-mono">{ex.sets || "—"}</td>
                                    <td className="py-2 text-zinc-300 font-mono">{ex.reps || "—"}</td>
                                    <td className="py-2 text-zinc-400">{ex.rest_interval_seconds ? `${ex.rest_interval_seconds}s` : "—"}</td>
                                    <td className="py-2 text-zinc-400">{ex.instructions || "—"}</td>
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

              {/* SUBTAB 2: MEALS */}
              {subTab === "meals" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm">Assigned Nutrition & Meal Plans</h4>
                      <p className="text-xs text-zinc-400">Structured daily meals for {member.customer_name}</p>
                    </div>
                    <button
                      onClick={() => setShowNewMealModal(true)}
                      className="bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Plus weight="bold" className="w-3.5 h-3.5" />
                      Create Meal Plan
                    </button>
                  </div>

                  {meals.length === 0 ? (
                    <div className="p-8 border border-zinc-800 rounded-xl text-center text-zinc-500 text-xs">
                      <ForkKnife className="w-10 h-10 mx-auto text-zinc-700 mb-2" />
                      No meal plan assigned yet. Click &quot;Create Meal Plan&quot; to provide nutritional guidance.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {meals.map(mp => (
                        <div
                          key={mp.id}
                          className="border border-zinc-800 rounded-xl p-4 bg-zinc-850/50 space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <h5 className="font-bold text-white text-sm">{mp.title}</h5>
                                {mp.daily_calories ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-lime-400 font-mono font-bold">
                                    {mp.daily_calories} kcal / day
                                  </span>
                                ) : null}
                              </div>
                              {mp.notes && <p className="text-xs text-zinc-400 mt-0.5">{mp.notes}</p>}
                            </div>
                            <span className="text-[11px] text-zinc-500 font-mono">{mp.start_date}</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                            {mp.items.map(it => (
                              <div
                                key={it.id}
                                className="p-2.5 rounded-lg bg-zinc-800/40 border border-zinc-800/80 text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-lime-400">
                                    {it.meal_type}
                                  </span>
                                  <span className="text-zinc-400 font-mono text-[11px]">{it.portion}</span>
                                </div>
                                <div className="font-semibold text-white">{it.food_name}</div>
                                {it.instructions && (
                                  <div className="text-[11px] text-zinc-400">{it.instructions}</div>
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

              {/* SUBTAB 3: ATTENDANCE & PT SESSIONS */}
              {subTab === "attendance" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm">Attendance History & 1-on-1 Sessions</h4>
                      <p className="text-xs text-zinc-400">
                        Tracks general gym entrance recorded by reception and completed personal training sessions.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowRecordSessionModal(true)}
                      className="bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Plus weight="bold" className="w-3.5 h-3.5" />
                      Record 1-on-1 PT Session
                    </button>
                  </div>

                  {attendance.length === 0 ? (
                    <div className="p-8 border border-zinc-800 rounded-xl text-center text-zinc-500 text-xs">
                      <CalendarCheck className="w-10 h-10 mx-auto text-zinc-700 mb-2" />
                      No attendance or training sessions recorded for this member yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-500">
                            <th className="pb-2 pl-2">Activity Type</th>
                            <th className="pb-2">Date & Time</th>
                            <th className="pb-2">Focus / Details</th>
                            <th className="pb-2">Recorded By</th>
                            <th className="pb-2">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/40">
                          {attendance.map(item => (
                            <tr key={item.id} className="hover:bg-zinc-800/20">
                              <td className="py-2.5 pl-2 font-semibold">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    item.source === "PT_SESSION"
                                      ? "bg-purple-400/20 text-purple-300 border border-purple-400/30"
                                      : "bg-blue-400/20 text-blue-300 border border-blue-400/30"
                                  }`}
                                >
                                  {item.source === "PT_SESSION"
                                    ? "1-on-1 PT Session"
                                    : "Gym Check-in (Reception)"}
                                </span>
                              </td>
                              <td className="py-2.5 text-white font-mono">
                                {new Date(item.activity_time).toLocaleDateString()} at{" "}
                                {new Date(item.activity_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </td>
                              <td className="py-2.5 text-zinc-300 font-medium">
                                {item.session_focus || (item.source === "PT_SESSION" ? "Workout" : "Gym Access")}
                              </td>
                              <td className="py-2.5 text-zinc-400">
                                {item.recorded_by_name || (item.source === "PT_SESSION" ? "Coach" : "Reception")}
                              </td>
                              <td className="py-2.5 text-zinc-400 max-w-xs truncate">
                                {item.notes || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* SUBTAB 4: PROGRESS RECORDS */}
              {subTab === "progress" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm">Member Progress Timeline</h4>
                      <p className="text-xs text-zinc-400">Weight, body measurements, strength PRs, and milestones</p>
                    </div>
                    <button
                      onClick={() => setShowRecordProgressModal(true)}
                      className="bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Plus weight="bold" className="w-3.5 h-3.5" />
                      Record Progress
                    </button>
                  </div>

                  {progressRecords.length === 0 ? (
                    <div className="p-8 border border-zinc-800 rounded-xl text-center text-zinc-500 text-xs">
                      <TrendUp className="w-10 h-10 mx-auto text-zinc-700 mb-2" />
                      No progress recorded yet. Click &quot;Record Progress&quot; to log weight or strength milestones.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-500">
                            <th className="pb-2 pl-2">Date</th>
                            <th className="pb-2">Weight</th>
                            <th className="pb-2">Body Fat</th>
                            <th className="pb-2">Chest</th>
                            <th className="pb-2">Waist</th>
                            <th className="pb-2">Arms</th>
                            <th className="pb-2">Strength / PRs</th>
                            <th className="pb-2">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/40">
                          {progressRecords.map(pr => (
                            <tr key={pr.id}>
                              <td className="py-2.5 pl-2 text-white font-mono">{pr.recordedDate}</td>
                              <td className="py-2.5 text-lime-400 font-bold font-mono">
                                {pr.weightKg ? `${pr.weightKg} kg` : "—"}
                              </td>
                              <td className="py-2.5 text-zinc-300 font-mono">
                                {pr.bodyFatPercentage ? `${pr.bodyFatPercentage}%` : "—"}
                              </td>
                              <td className="py-2.5 text-zinc-400 font-mono">{pr.chestCm ? `${pr.chestCm} cm` : "—"}</td>
                              <td className="py-2.5 text-zinc-400 font-mono">{pr.waistCm ? `${pr.waistCm} cm` : "—"}</td>
                              <td className="py-2.5 text-zinc-400 font-mono">{pr.armsCm ? `${pr.armsCm} cm` : "—"}</td>
                              <td className="py-2.5 text-zinc-200">
                                {pr.workoutPerformance || (pr.benchPressMaxKg ? `Bench: ${pr.benchPressMaxKg}kg` : "—")}
                              </td>
                              <td className="py-2.5 text-zinc-400">{pr.notes || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* SUBTAB 5: COACHING NOTES */}
              {subTab === "notes" && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-white text-sm">Trainer Coaching Notes</h4>
                    <p className="text-xs text-zinc-400">Confidential coach observations and training guidance</p>
                  </div>

                  <form onSubmit={handleAddCoachingNote} className="space-y-2">
                    <textarea
                      rows={2}
                      placeholder="Add a new coaching note for this member..."
                      value={newNoteContent}
                      onChange={e => setNewNoteContent(e.target.value)}
                      className={INPUT}
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isSavingNote || !newNoteContent.trim()}
                        className="bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold px-4 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50"
                      >
                        {isSavingNote ? "Saving..." : "Save Note"}
                      </button>
                    </div>
                  </form>

                  <div className="space-y-2 pt-2">
                    {notes.length === 0 ? (
                      <p className="text-zinc-500 text-xs italic">No coaching notes added yet.</p>
                    ) : (
                      notes.map(n => (
                        <div key={n.id} className="p-3 bg-zinc-800/40 border border-zinc-800 rounded-xl space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-zinc-500">
                            <span className="font-semibold text-lime-400">{n.workoutFocus || "Coach Observation"}</span>
                            <span>{new Date(n.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs text-zinc-200 leading-relaxed">{n.notes}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/80 flex justify-end">
          <button
            onClick={onClose}
            className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-colors"
          >
            Close Suite
          </button>
        </div>
      </div>

      {/* CREATE WORKOUT MODAL */}
      {showNewWorkoutModal && (
        <CreateWorkoutPlanModal
          customerId={member.customer_id}
          trainerId={trainerProfile?.id || ""}
          onClose={() => setShowNewWorkoutModal(false)}
          onCreated={() => {
            setShowNewWorkoutModal(false);
            void loadMemberCoachingData();
          }}
        />
      )}

      {/* CREATE MEAL MODAL */}
      {showNewMealModal && (
        <CreateMealPlanModal
          customerId={member.customer_id}
          trainerId={trainerProfile?.id || ""}
          onClose={() => setShowNewMealModal(false)}
          onCreated={() => {
            setShowNewMealModal(false);
            void loadMemberCoachingData();
          }}
        />
      )}

      {/* RECORD 1-ON-1 PT SESSION MODAL */}
      {showRecordSessionModal && (
        <RecordPtSessionModal
          customerId={member.customer_id}
          trainerId={trainerProfile?.id || ""}
          trainerName={trainerProfile?.fullName || "Coach"}
          onClose={() => setShowRecordSessionModal(false)}
          onCreated={() => {
            setShowRecordSessionModal(false);
            void loadMemberCoachingData();
            onUpdated();
          }}
        />
      )}

      {/* RECORD PROGRESS MODAL */}
      {showRecordProgressModal && (
        <RecordProgressModal
          customerId={member.customer_id}
          trainerId={trainerProfile?.id || ""}
          onClose={() => setShowRecordProgressModal(false)}
          onCreated={() => {
            setShowRecordProgressModal(false);
            void loadMemberCoachingData();
          }}
        />
      )}
    </div>
  );
}

// ==============================================================================
// CREATE WORKOUT PLAN MODAL
// ==============================================================================
function CreateWorkoutPlanModal({
  customerId,
  trainerId,
  onClose,
  onCreated,
}: {
  customerId: string;
  trainerId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("Custom Personalized Workout");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [exercises, setExercises] = useState<
    Array<{
      exercise_name: string;
      sets: number;
      reps: string;
      duration_seconds: number | null;
      rest_interval_seconds: number | null;
      instructions: string;
      day_of_week: string;
    }>
  >([
    {
      exercise_name: "Barbell Back Squat",
      sets: 4,
      reps: "10",
      duration_seconds: null,
      rest_interval_seconds: 90,
      instructions: "Keep back tight, knees in line with toes",
      day_of_week: "Monday",
    },
  ]);

  const handleApplyTemplate = (templateName: string) => {
    const t = WORKOUT_TEMPLATES.find(tpl => tpl.name === templateName);
    if (!t) return;
    setTitle(t.name);
    setDescription(t.description);
    setExercises(t.exercises);
    toast.success(`Template "${t.name}" applied!`);
  };

  const handleAddExerciseRow = () => {
    setExercises(prev => [
      ...prev,
      {
        exercise_name: "",
        sets: 3,
        reps: "10-12",
        duration_seconds: null,
        rest_interval_seconds: 60,
        instructions: "",
        day_of_week: "Monday",
      },
    ]);
  };

  const handleRemoveExerciseRow = (index: number) => {
    setExercises(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a title for the workout plan.");
      return;
    }
    if (exercises.length === 0 || !exercises[0].exercise_name.trim()) {
      toast.error("Please add at least one exercise.");
      return;
    }

    setIsSubmitting(true);
    try {
      await saveWorkoutPlan({
        customerId,
        trainerId,
        title: title.trim(),
        description: description.trim() || undefined,
        startDate,
        endDate: endDate || undefined,
        status: "ACTIVE",
        exercises: exercises.map((ex, i) => ({
          dayOfWeek: ex.day_of_week || "Day 1",
          exerciseName: ex.exercise_name,
          sets: Number(ex.sets) || 3,
          reps: Number(ex.reps) || 10,
          durationSeconds: ex.duration_seconds || 0,
          restSeconds: ex.rest_interval_seconds || 60,
          instructions: ex.instructions || undefined,
          orderIndex: i,
        })),
      });
      toast.success("Workout plan saved successfully!");
      onCreated();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save workout plan.");
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
            <h4 className="font-bold text-white text-base">Create Member Workout Plan</h4>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
          >
            <X weight="bold" className="w-5 h-5" />
          </button>
        </div>

        {/* Template Selector Shortcut */}
        <div className="bg-zinc-800/40 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-300 font-semibold">Quick Template:</span>
          <div className="flex gap-1.5 overflow-x-auto">
            {WORKOUT_TEMPLATES.map(t => (
              <button
                key={t.name}
                type="button"
                onClick={() => handleApplyTemplate(t.name)}
                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-lime-400 text-[11px] font-semibold border border-zinc-700 transition-colors whitespace-nowrap"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
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
              <label className={LABEL}>Start Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Plan Description / Focus</label>
            <input
              type="text"
              placeholder="e.g. Focus on chest hypertrophy and core stability"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={INPUT}
            />
          </div>

          {/* Exercises List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={LABEL}>Exercises Routine ({exercises.length})</label>
              <button
                type="button"
                onClick={handleAddExerciseRow}
                className="text-xs text-lime-400 hover:underline font-semibold"
              >
                + Add Exercise
              </button>
            </div>

            <div className="space-y-2.5">
              {exercises.map((ex, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-zinc-800/50 border border-zinc-700/60 rounded-xl space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-lime-400">#{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveExerciseRow(idx)}
                      className="text-zinc-500 hover:text-red-400 text-xs"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        placeholder="Exercise Name (e.g. Incline Bench Press)"
                        value={ex.exercise_name}
                        onChange={e => {
                          const val = e.target.value;
                          setExercises(prev =>
                            prev.map((item, i) => (i === idx ? { ...item, exercise_name: val } : item))
                          );
                        }}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Day (e.g. Mon)"
                        value={ex.day_of_week}
                        onChange={e => {
                          const val = e.target.value;
                          setExercises(prev =>
                            prev.map((item, i) => (i === idx ? { ...item, day_of_week: val } : item))
                          );
                        }}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        placeholder="Sets"
                        value={ex.sets}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setExercises(prev =>
                            prev.map((item, i) => (i === idx ? { ...item, sets: val } : item))
                          );
                        }}
                        className={INPUT}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div>
                      <input
                        type="text"
                        placeholder="Reps (e.g. 10-12)"
                        value={ex.reps}
                        onChange={e => {
                          const val = e.target.value;
                          setExercises(prev =>
                            prev.map((item, i) => (i === idx ? { ...item, reps: val } : item))
                          );
                        }}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        placeholder="Rest (sec)"
                        value={ex.rest_interval_seconds ?? ""}
                        onChange={e => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          setExercises(prev =>
                            prev.map((item, i) => (i === idx ? { ...item, rest_interval_seconds: val } : item))
                          );
                        }}
                        className={INPUT}
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <input
                        type="text"
                        placeholder="Notes / Form"
                        value={ex.instructions}
                        onChange={e => {
                          const val = e.target.value;
                          setExercises(prev =>
                            prev.map((item, i) => (i === idx ? { ...item, instructions: val } : item))
                          );
                        }}
                        className={INPUT}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-zinc-800">
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
              Save Workout Plan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==============================================================================
// CREATE MEAL PLAN MODAL
// ==============================================================================
function CreateMealPlanModal({
  customerId,
  trainerId,
  onClose,
  onCreated,
}: {
  customerId: string;
  trainerId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("Daily Nutrition Program");
  const [calories, setCalories] = useState<number | null>(2400);
  const [notes, setNotes] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [items, setItems] = useState<
    Array<{
      meal_type: string;
      food_name: string;
      portion: string;
      instructions: string;
    }>
  >([
    {
      meal_type: "breakfast",
      food_name: "Oatmeal with Honey & 3 Boiled Eggs",
      portion: "80g oats, 3 eggs",
      instructions: "Drink 500ml water upon waking",
    },
    {
      meal_type: "lunch",
      food_name: "Grilled Chicken Breast with White Rice",
      portion: "200g chicken, 150g cooked rice",
      instructions: "Add fresh garden salad",
    },
    {
      meal_type: "dinner",
      food_name: "Fish with Steamed Vegetables",
      portion: "200g fish fillet, mixed greens",
      instructions: "Season with lemon juice and black pepper",
    },
  ]);

  const handleApplyTemplate = (templateName: string) => {
    const t = MEAL_TEMPLATES.find(tpl => tpl.name === templateName);
    if (!t) return;
    setTitle(t.name);
    setCalories(t.daily_calories);
    setNotes(t.notes);
    setItems(t.items);
    toast.success(`Template "${t.name}" applied!`);
  };

  const handleAddItemRow = () => {
    setItems(prev => [
      ...prev,
      {
        meal_type: "snack",
        food_name: "",
        portion: "",
        instructions: "",
      },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a title for the meal plan.");
      return;
    }

    setIsSubmitting(true);
    try {
      await saveMealPlan({
        customerId,
        trainerId,
        title: title.trim(),
        dailyCalories: calories ?? undefined,
        notes: notes.trim() || undefined,
        startDate,
        items: items.map((it, i) => ({
          mealType: (it.meal_type.toUpperCase() as any) || "BREAKFAST",
          foodName: it.food_name,
          portion: it.portion,
          nutritionalInstructions: it.instructions || undefined,
          orderIndex: i,
        })),
      });
      toast.success("Meal plan saved successfully!");
      onCreated();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save meal plan.");
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
            <h4 className="font-bold text-white text-base">Create Member Meal Plan</h4>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
          >
            <X weight="bold" className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Template Selector */}
        <div className="bg-zinc-800/40 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-300 font-semibold">Quick Template:</span>
          <div className="flex gap-1.5 overflow-x-auto">
            {MEAL_TEMPLATES.map(t => (
              <button
                key={t.name}
                type="button"
                onClick={() => handleApplyTemplate(t.name)}
                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-lime-400 text-[11px] font-semibold border border-zinc-700 transition-colors whitespace-nowrap"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 pr-1">
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
                value={calories ?? ""}
                onChange={e => setCalories(e.target.value ? Number(e.target.value) : null)}
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Nutrition Guidelines / Instructions</label>
            <input
              type="text"
              placeholder="e.g. Stay hydrated, avoid fried oils, limit sodium"
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
                onClick={handleAddItemRow}
                className="text-xs text-lime-400 hover:underline font-semibold"
              >
                + Add Meal
              </button>
            </div>

            <div className="space-y-2.5">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-zinc-800/50 border border-zinc-700/60 rounded-xl space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-lime-400">Meal #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItemRow(idx)}
                      className="text-zinc-500 hover:text-red-400 text-xs"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <select
                        value={it.meal_type}
                        onChange={e => {
                          const val = e.target.value;
                          setItems(prev =>
                            prev.map((item, i) => (i === idx ? { ...item, meal_type: val } : item))
                          );
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
                        placeholder="Food Item(s)"
                        value={it.food_name}
                        onChange={e => {
                          const val = e.target.value;
                          setItems(prev =>
                            prev.map((item, i) => (i === idx ? { ...item, food_name: val } : item))
                          );
                        }}
                        className={INPUT}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <input
                        type="text"
                        placeholder="Portion / Amount (e.g. 200g)"
                        value={it.portion}
                        onChange={e => {
                          const val = e.target.value;
                          setItems(prev =>
                            prev.map((item, i) => (i === idx ? { ...item, portion: val } : item))
                          );
                        }}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Special Instructions"
                        value={it.instructions}
                        onChange={e => {
                          const val = e.target.value;
                          setItems(prev =>
                            prev.map((item, i) => (i === idx ? { ...item, instructions: val } : item))
                          );
                        }}
                        className={INPUT}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-zinc-800">
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
              Save Meal Plan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==============================================================================
// RECORD 1-ON-1 PT SESSION MODAL
// ==============================================================================
function RecordPtSessionModal({
  customerId,
  trainerId,
  trainerName,
  onClose,
  onCreated,
}: {
  customerId: string;
  trainerId: string;
  trainerName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [sessionFocus, setSessionFocus] = useState("Lower Body Strength & Mobility");
  const [performanceNotes, setPerformanceNotes] = useState("");
  const [customerFeedback, setCustomerFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await recordCompletedPersonalTrainingSession({
        customerId,
        trainerId,
        sessionDate,
        durationMinutes,
        sessionFocus: sessionFocus.trim() || undefined,
        performanceNotes: performanceNotes.trim() || undefined,
        customerFeedback: customerFeedback.trim() || undefined,
      });
      toast.success("1-on-1 personal training session recorded!");
      onCreated();
    } catch (err: any) {
      toast.error(err?.message || "Failed to record session.");
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
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
          >
            <X weight="bold" className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Date *</label>
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
              placeholder="e.g. Chest & Triceps, Squat Depth, Cardio Intervals"
              value={sessionFocus}
              onChange={e => setSessionFocus(e.target.value)}
              className={INPUT}
            />
          </div>

          <div>
            <label className={LABEL}>Coach Performance Notes</label>
            <textarea
              rows={2}
              placeholder="Member hit squat PR 80kg, good pacing, high intensity..."
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
              Save Session Record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==============================================================================
// RECORD PROGRESS MODAL
// ==============================================================================
function RecordProgressModal({
  customerId,
  trainerId,
  onClose,
  onCreated,
}: {
  customerId: string;
  trainerId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [recordDate, setRecordDate] = useState(new Date().toISOString().split("T")[0]);
  const [weight, setWeight] = useState<string>("");
  const [bodyFat, setBodyFat] = useState<string>("");
  const [chest, setChest] = useState<string>("");
  const [waist, setWaist] = useState<string>("");
  const [arms, setArms] = useState<string>("");
  const [strength, setStrength] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await recordMemberProgress({
        customerId,
        trainerId,
        recordedDate: recordDate,
        weightKg: weight ? parseFloat(weight) : undefined,
        bodyFatPercentage: bodyFat ? parseFloat(bodyFat) : undefined,
        chestCm: chest ? parseFloat(chest) : undefined,
        waistCm: waist ? parseFloat(waist) : undefined,
        armsCm: arms ? parseFloat(arms) : undefined,
        workoutPerformance: strength.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Progress record saved successfully!");
      onCreated();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save progress.");
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
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
          >
            <X weight="bold" className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={LABEL}>Record Date *</label>
            <input
              type="date"
              required
              value={recordDate}
              onChange={e => setRecordDate(e.target.value)}
              className={INPUT}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Weight (kg)</label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 74.5"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Body Fat (%)</label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 15.2"
                value={bodyFat}
                onChange={e => setBodyFat(e.target.value)}
                className={INPUT}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={LABEL}>Chest (cm)</label>
              <input
                type="number"
                step="0.5"
                placeholder="e.g. 102"
                value={chest}
                onChange={e => setChest(e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Waist (cm)</label>
              <input
                type="number"
                step="0.5"
                placeholder="e.g. 82"
                value={waist}
                onChange={e => setWaist(e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Arms (cm)</label>
              <input
                type="number"
                step="0.5"
                placeholder="e.g. 38"
                value={arms}
                onChange={e => setArms(e.target.value)}
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Strength Benchmarks / PRs</label>
            <input
              type="text"
              placeholder="e.g. Bench: 90kg x 3, Deadlift: 140kg x 1"
              value={strength}
              onChange={e => setStrength(e.target.value)}
              className={INPUT}
            />
          </div>

          <div>
            <label className={LABEL}>General Notes</label>
            <input
              type="text"
              placeholder="e.g. Great progress on conditioning, visibly leaner"
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
              Save Progress
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
