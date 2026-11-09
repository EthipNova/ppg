import { useState, useEffect, useCallback } from "react";
import {
  Phone,
  EnvelopeSimple,
  Calendar,
  Barbell,
  ForkKnife,
  VideoCamera,
  TrendUp,
  Clock,
  ArrowClockwise,
  Play,
  Info,
  Flame,
  ChatCircleText,
  Target,
  CheckCircle,
  Sparkle,
} from "@phosphor-icons/react";
import {
  fetchCustomerMyTrainerBundle,
  getExerciseVideoSignedUrl,
  fetchInAppNotifications,
  markNotificationAsRead,
  getGymTodayWeekday,
  WEEKDAY_NAMES,
  type InAppNotification,
  type CustomerActiveTrainerInfo,
  type CustomerMyTrainerBundle,
  type ExerciseSetRecord,
  type MemberWeeklyScheduleItem,
} from "../services/personalTrainerService";
import { toast } from "sonner";

interface CustomerMyTrainerProps {
  customerId: string;
  initialTrainer?: CustomerActiveTrainerInfo | null;
  onTrainerStatusChange?: (hasActiveTrainer: boolean) => void;
}

export default function CustomerMyTrainer({
  customerId,
  initialTrainer,
  onTrainerStatusChange,
}: CustomerMyTrainerProps) {
  const [activeSection, setActiveSection] = useState<
    "overview" | "workouts" | "meals" | "videos" | "progress"
  >("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bundle, setBundle] = useState<CustomerMyTrainerBundle | null>(null);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [videoSignedUrls, setVideoSignedUrls] = useState<Record<string, string>>({});
  const [activeVideoModal, setActiveVideoModal] = useState<{
    url: string;
    title: string;
    description?: string;
  } | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!customerId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [data, notifs] = await Promise.all([
        fetchCustomerMyTrainerBundle(customerId),
        fetchInAppNotifications(customerId),
      ]);
      setBundle(data);
      setNotifications(notifs);

      if (onTrainerStatusChange) {
        onTrainerStatusChange(data.hasActiveTrainer);
      }

      // Preload signed URLs for exercise videos in parallel
      if (data.exerciseVideos.length > 0) {
        const urlMap: Record<string, string> = {};
        await Promise.all(
          data.exerciseVideos.map(async (v) => {
            if (v.storagePath) {
              try {
                const signed = await getExerciseVideoSignedUrl(v.storagePath);
                urlMap[v.id] = signed;
              } catch {
                // Ignore individual video signed URL failures
              }
            }
          })
        );
        setVideoSignedUrls(urlMap);
      }

      if (isRefresh) {
        toast.success("Training information updated from your coach.");
      }
    } catch (err: unknown) {
      console.error("Failed to load customer trainer bundle:", err);
      toast.error("Unable to load latest training information.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId, onTrainerStatusChange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && !bundle) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[350px]">
        <div className="w-10 h-10 border-4 border-lime-400/20 border-t-lime-400 rounded-full animate-spin mb-4" />
        <h3 className="text-lg font-bold text-white uppercase tracking-wider">Connecting to My Trainer</h3>
        <p className="text-xs text-zinc-400 mt-1">Retrieving your personal training routine, nutrition, and coach updates...</p>
      </div>
    );
  }

  const trainer = bundle?.trainer || initialTrainer;
  if (!bundle?.hasActiveTrainer && !trainer) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 md:p-12 text-center max-w-xl mx-auto">
        <div className="w-16 h-16 bg-zinc-800 text-zinc-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Barbell weight="duotone" className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">No Active Personal Trainer</h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-6">
          You currently do not have an active personal training assignment. To get dedicated one-on-one coaching, customized workout routines, and guided meal plans, please speak with Reception to assign a personal trainer.
        </p>
      </div>
    );
  }

  const workoutPlans = bundle?.workoutPlans || [];
  const weeklySchedule: MemberWeeklyScheduleItem[] = bundle?.weeklySchedule || [];
  const mealPlans = bundle?.mealPlans || [];
  const exerciseVideos = bundle?.exerciseVideos || [];
  const progressRecords = bundle?.progressRecords || [];
  const coachingNotes = bundle?.coachingNotes || [];

  const todayWeekday = getGymTodayWeekday();
  const todayScheduleItem = weeklySchedule.find(
    (s) => s.dayOfWeek.toLowerCase() === todayWeekday.toLowerCase()
  );

  const latestProgress = progressRecords.length > 0 ? progressRecords[0] : null;

  return (
    <div className="space-y-6">
      {/* 1. Trainer Profile Header Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-3xl p-6 md:p-8 shadow-2xl">
        {/* Ambient Glow */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-lime-400/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {/* Trainer Avatar Badge */}
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-lime-400 to-lime-600 p-0.5 shadow-lg flex-shrink-0">
              <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center text-lime-400 overflow-hidden">
                <span className="text-2xl md:text-3xl font-black uppercase tracking-tight">
                  {trainer?.firstName?.[0] || ""}{trainer?.lastName?.[0] || "PT"}
                </span>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-lime-400/10 border border-lime-400/30 text-lime-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
                  Active Coach
                </span>
                <span className="text-xs text-zinc-400 bg-zinc-800/80 px-2.5 py-0.5 rounded-full">
                  {trainer?.specialization || "Personal Fitness Trainer"}
                </span>
              </div>

              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight uppercase">
                {trainer?.fullName || "Personal Trainer"}
              </h2>

              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-zinc-400">
                {trainer?.phone && (
                  <a
                    href={`tel:${trainer.phone}`}
                    className="inline-flex items-center gap-1.5 hover:text-lime-400 transition-colors"
                  >
                    <Phone weight="fill" className="w-3.5 h-3.5 text-lime-400" />
                    <span>{trainer.phone}</span>
                  </a>
                )}
                {trainer?.email && (
                  <a
                    href={`mailto:${trainer.email}`}
                    className="inline-flex items-center gap-1.5 hover:text-lime-400 transition-colors"
                  >
                    <EnvelopeSimple weight="fill" className="w-3.5 h-3.5 text-lime-400" />
                    <span>{trainer.email}</span>
                  </a>
                )}
                {trainer?.startDate && (
                  <span className="inline-flex items-center gap-1.5 text-zinc-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Since {new Date(trainer.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors border border-zinc-700 disabled:opacity-50"
            >
              <ArrowClockwise className={`w-4 h-4 ${refreshing ? "animate-spin text-lime-400" : ""}`} />
              <span>{refreshing ? "Syncing..." : "Sync Coach Updates"}</span>
            </button>
          </div>
        </div>

        {trainer?.notes && (
          <div className="mt-4 pt-4 border-t border-zinc-800/80 text-xs text-zinc-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-lime-400 flex-shrink-0 mt-0.5" />
            <p className="italic">{trainer.notes}</p>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { key: "overview", label: "Overview", icon: Target, count: coachingNotes.length + progressRecords.length },
          { key: "workouts", label: "Workout Plans", icon: Barbell, count: workoutPlans.length },
          { key: "meals", label: "Meal Plans", icon: ForkKnife, count: mealPlans.length },
          { key: "videos", label: "Exercise Videos", icon: VideoCamera, count: exerciseVideos.length },
          { key: "progress", label: "Progress Logs", icon: TrendUp, count: progressRecords.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key as typeof activeSection)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/10 scale-[1.02]"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-850"
              }`}
            >
              <Icon weight={isActive ? "fill" : "regular"} className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isActive ? "bg-zinc-950 text-lime-400" : "bg-zinc-800 text-zinc-300"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* SECTION: OVERVIEW & NOTES */}
      {activeSection === "overview" && (
        <div className="space-y-6">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                Today's Workout
              </span>
              <span className="text-lg font-black text-white truncate block">
                {todayScheduleItem
                  ? todayScheduleItem.workoutTitle
                  : workoutPlans[0]?.title || "Awaiting Routine"}
              </span>
              <span className="text-xs text-lime-400 block mt-1 truncate">
                {todayScheduleItem?.isRestDay
                  ? "Rest & Recovery Day"
                  : todayScheduleItem?.focusArea
                  ? todayScheduleItem.focusArea
                  : todayScheduleItem
                  ? `${todayScheduleItem.exercises?.length || 0} exercises`
                  : `${workoutPlans[0]?.exercises?.length || 0} exercises assigned`}
              </span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                Meal Plan Target
              </span>
              <span className="text-lg font-black text-white">
                {mealPlans[0]?.dailyCalorieTarget ? `${mealPlans[0].dailyCalorieTarget} kcal` : "Custom Macros"}
              </span>
              <span className="text-xs text-zinc-400 block mt-1">
                {mealPlans[0]?.title || "Standard Diet"}
              </span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                Logged Weight
              </span>
              <span className="text-lg font-black text-lime-400">
                {latestProgress?.weightKg ? `${latestProgress.weightKg} kg` : "—"}
              </span>
              <span className="text-xs text-zinc-400 block mt-1">
                {latestProgress?.recordedDate || "No logs yet"}
              </span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                Coach Demos
              </span>
              <span className="text-lg font-black text-white">
                {exerciseVideos.length} Available
              </span>
              <span className="text-xs text-zinc-400 block mt-1">
                Video library
              </span>
            </div>
          </div>

          {/* Coaching Observations & Latest Feedback */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <ChatCircleText weight="fill" className="w-5 h-5 text-lime-400" />
              <h3 className="text-base font-bold text-white uppercase tracking-wider">
                Coach Observations & Progress Notes
              </h3>
            </div>

            {coachingNotes.length === 0 && (!latestProgress?.workoutPerformance && !latestProgress?.notes) ? (
              <div className="text-center py-8 text-zinc-500">
                <p className="text-sm">No notes recorded yet by your trainer.</p>
                <p className="text-xs text-zinc-600 mt-1">Your trainer will post training observations, feedback, and performance tips here after sessions.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {coachingNotes.map((note) => (
                  <div
                    key={note.id}
                    className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span className="font-bold text-lime-400 uppercase tracking-wider">
                        {note.workoutFocus}
                      </span>
                      <span>
                        {new Date(note.sessionDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-line">{note.notes}</p>
                  </div>
                ))}

                {latestProgress && (latestProgress.workoutPerformance || latestProgress.notes) && (
                  <div className="p-4 rounded-2xl bg-zinc-950/60 border border-lime-400/20 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-lime-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Flame weight="fill" className="w-4 h-4 text-lime-400" />
                        Latest Progress Assessment
                      </span>
                      <span className="text-zinc-500">
                        {new Date(latestProgress.recordedDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    {latestProgress.workoutPerformance && (
                      <p className="text-sm text-zinc-200">
                        <strong className="text-white">Performance: </strong>
                        {latestProgress.workoutPerformance}
                      </p>
                    )}
                    {latestProgress.notes && (
                      <p className="text-xs text-zinc-400 italic">
                        <strong className="text-zinc-300 not-italic">Coach Instructions: </strong>
                        {latestProgress.notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION: WORKOUT PLANS & WEEKLY ROUTINE */}
      {activeSection === "workouts" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Barbell weight="fill" className="w-5 h-5 text-lime-400" />
                <span>Assigned Workout Routine & Logs</span>
              </h3>
              <p className="text-xs text-zinc-400">
                Your customized weekly routine and tracked session performance with multi-set targets.
              </p>
            </div>
            <span className="self-start sm:self-auto text-xs font-bold text-lime-400 bg-lime-400/10 border border-lime-400/20 px-3 py-1 rounded-full">
              {workoutPlans.length} {workoutPlans.length === 1 ? "Session Log" : "Session Logs"}
            </span>
          </div>

          {/* In-app Notification Alert Banner */}
          {notifications.some((n) => !n.isRead && n.type === "WORKOUT_PUBLISHED") && (
            <div className="p-4 rounded-2xl bg-lime-400/10 border border-lime-400/30 flex items-center justify-between gap-3 text-xs text-lime-300">
              <div className="flex items-center gap-2.5">
                <Sparkle weight="fill" className="w-5 h-5 text-lime-400 shrink-0" />
                <span className="font-medium">
                  {notifications.find((n) => !n.isRead && n.type === "WORKOUT_PUBLISHED")?.message ||
                    "Your coach published a new workout routine!"}
                </span>
              </div>
              <button
                onClick={async () => {
                  const unread = notifications.filter(
                    (n) => !n.isRead && n.type === "WORKOUT_PUBLISHED"
                  );
                  for (const u of unread) await markNotificationAsRead(u.id);
                  setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
                  toast.success("Notification dismissed.");
                }}
                className="px-3 py-1.5 bg-lime-400 text-zinc-950 font-bold rounded-xl text-xs shrink-0 hover:bg-lime-300 transition-colors shadow-sm"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* WEEKLY ROUTINE SCHEDULE CARDS */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Calendar weight="fill" className="w-4 h-4 text-lime-400" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Weekly Training Routine (Mon – Sun)
                </h4>
              </div>
              <div className="text-xs text-zinc-400">
                Today is <span className="font-bold text-lime-400">{todayWeekday}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
              {WEEKDAY_NAMES.map((day) => {
                const item = weeklySchedule.find(
                  (s) => s.dayOfWeek.toLowerCase() === day.toLowerCase()
                );
                const isToday = day.toLowerCase() === todayWeekday.toLowerCase();
                const isRest = item ? item.isRestDay : day === "Sunday";
                const workoutTitle = item?.workoutTitle || (isRest ? "Rest Day" : "Training");
                const focusArea = item?.focusArea || "";
                const exerciseCount = item?.exercises?.length || 0;

                return (
                  <div
                    key={day}
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                      isToday
                        ? "bg-lime-400/10 border-lime-400/60 shadow-lg shadow-lime-400/5 ring-1 ring-lime-400/30"
                        : isRest
                        ? "bg-zinc-950/40 border-zinc-800/60 text-zinc-400"
                        : "bg-zinc-950/80 border-zinc-800 text-white"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span
                          className={`text-[11px] font-black uppercase tracking-wider ${
                            isToday ? "text-lime-400" : "text-zinc-400"
                          }`}
                        >
                          {day.slice(0, 3)}
                        </span>
                        {isToday && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-lime-400 text-zinc-950 shadow-sm animate-pulse">
                            Today
                          </span>
                        )}
                        {isRest && !isToday && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-zinc-800 text-zinc-400">
                            Rest
                          </span>
                        )}
                      </div>

                      <div className="font-bold text-xs text-white line-clamp-1 mb-1">
                        {workoutTitle}
                      </div>

                      {focusArea && (
                        <div className="text-[10px] text-zinc-400 line-clamp-1 mb-1">
                          {focusArea}
                        </div>
                      )}
                    </div>

                    <div className="mt-2 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px]">
                      {isRest ? (
                        <span className="text-zinc-500 italic">Recovery</span>
                      ) : (
                        <span className="text-lime-400 font-mono">
                          {exerciseCount > 0 ? `${exerciseCount} exercises` : "Scheduled"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RECORDED WORKOUT SESSIONS & PERFORMANCE LOGS */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                Workout Session Logs & Multi-Set Performance
              </h4>
              <span className="text-xs text-zinc-500">Showing latest recorded sessions</span>
            </div>

            {workoutPlans.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 sm:p-10 text-center">
                <Barbell weight="duotone" className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <h4 className="text-base font-bold text-white mb-1">No Workout Sessions Logged Yet</h4>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Your trainer will log your workout performance, sets, weights, and reps here during your coaching sessions. Follow your weekly routine above in the meantime!
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {workoutPlans.map((plan) => {
                  const workoutDateStr = plan.workoutDate || plan.startDate || plan.createdAt;
                  const formattedDate = new Date(workoutDateStr).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  return (
                    <div
                      key={plan.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4"
                    >
                      {/* Session Header */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-zinc-800 pb-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h4 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
                              {plan.title}
                            </h4>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                plan.status === "COMPLETED"
                                  ? "bg-emerald-400/20 text-emerald-400 border border-emerald-400/30"
                                  : "bg-lime-400 text-zinc-950 font-bold"
                              }`}
                            >
                              {plan.status === "COMPLETED" ? "Completed" : "Logged Session"}
                            </span>
                            {plan.isCompleted && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Session Finished
                              </span>
                            )}
                          </div>
                          {plan.description && (
                            <p className="text-xs text-zinc-400 mt-1">{plan.description}</p>
                          )}
                        </div>

                        <div className="text-left md:text-right text-xs text-zinc-400">
                          <span>
                            Date: <strong className="text-white font-mono">{formattedDate}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Exercises with Multi-Set Tables */}
                      <div className="space-y-4">
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                          Exercises Recorded ({plan.exercises.length})
                        </span>

                        {plan.exercises.length === 0 ? (
                          <p className="text-xs text-zinc-500 italic">No specific exercises recorded in this session.</p>
                        ) : (
                          <div className="space-y-4">
                            {plan.exercises.map((ex, idx) => {
                              const sets: ExerciseSetRecord[] =
                                Array.isArray(ex.setsData) && ex.setsData.length > 0
                                  ? ex.setsData
                                  : Array.isArray(ex.sets_data) && ex.sets_data.length > 0
                                  ? ex.sets_data
                                  : [
                                      {
                                        setNumber: 1,
                                        plannedReps: Number(
                                          ex.plannedReps ?? ex.planned_reps ?? ex.reps ?? 10
                                        ),
                                        plannedWeightKg:
                                          ex.plannedWeightKg != null
                                            ? Number(ex.plannedWeightKg)
                                            : ex.planned_weight_kg != null
                                            ? Number(ex.planned_weight_kg)
                                            : null,
                                        actualReps:
                                          ex.actualReps != null
                                            ? Number(ex.actualReps)
                                            : ex.actual_reps != null
                                            ? Number(ex.actual_reps)
                                            : null,
                                        actualWeightKg:
                                          ex.actualWeightKg != null
                                            ? Number(ex.actualWeightKg)
                                            : ex.actual_weight_kg != null
                                            ? Number(ex.actual_weight_kg)
                                            : null,
                                        isCompleted: Boolean(ex.isCompleted ?? ex.is_completed),
                                      },
                                    ];

                              return (
                                <div
                                  key={ex.id || idx}
                                  className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 space-y-3"
                                >
                                  {/* Exercise Title & Info */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5">
                                      <span className="w-6 h-6 rounded-lg bg-zinc-800 text-lime-400 text-xs flex items-center justify-center font-black shrink-0">
                                        {idx + 1}
                                      </span>
                                      <h5 className="text-sm font-bold text-white">
                                        {ex.exerciseName || ex.exercise_name}
                                      </h5>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {ex.videoUrl && (
                                        <a
                                          href={ex.videoUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-[11px] text-lime-400 hover:underline"
                                        >
                                          <VideoCamera className="w-3.5 h-3.5" />
                                          <span>Video Demo</span>
                                        </a>
                                      )}
                                      <span className="text-[11px] text-zinc-400 font-mono">
                                        {sets.length} {sets.length === 1 ? "Set" : "Sets"}
                                      </span>
                                    </div>
                                  </div>

                                  {(ex.notes || ex.instructions) && (
                                    <p className="text-xs text-zinc-400 italic bg-zinc-900/60 px-3 py-1.5 rounded-lg border border-zinc-800/60">
                                      <strong className="text-zinc-300 not-italic">Coach Note: </strong>
                                      {ex.notes || ex.instructions}
                                    </p>
                                  )}

                                  {/* Multi-Set Table */}
                                  <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-900/40">
                                    <table className="w-full text-left text-xs border-collapse min-w-[360px]">
                                      <thead>
                                        <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-400 tracking-wider bg-zinc-900/90 font-bold">
                                          <th className="py-2 px-3 text-center w-16">Set #</th>
                                          <th className="py-2 px-3 text-center text-cyan-400">Planned Reps</th>
                                          <th className="py-2 px-3 text-center text-cyan-400">Planned KG</th>
                                          <th className="py-2 px-3 text-center text-lime-400">Actual Reps</th>
                                          <th className="py-2 px-3 text-center text-lime-400">Actual KG</th>
                                          <th className="py-2 px-3 text-center w-24">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
                                        {sets.map((set, sIdx) => (
                                          <tr key={sIdx} className="hover:bg-zinc-850/40">
                                            <td className="py-2 px-3 text-center font-bold text-zinc-400">
                                              Set {set.setNumber || sIdx + 1}
                                            </td>
                                            <td className="py-2 px-3 text-center text-zinc-200 bg-cyan-400/5">
                                              {set.plannedReps ?? "—"}
                                            </td>
                                            <td className="py-2 px-3 text-center text-zinc-200 bg-cyan-400/5">
                                              {set.plannedWeightKg != null
                                                ? `${set.plannedWeightKg} kg`
                                                : "Bodyweight"}
                                            </td>
                                            <td className="py-2 px-3 text-center text-lime-300 font-bold bg-lime-400/5">
                                              {set.actualReps != null ? set.actualReps : "—"}
                                            </td>
                                            <td className="py-2 px-3 text-center text-lime-300 font-bold bg-lime-400/5">
                                              {set.actualWeightKg != null
                                                ? `${set.actualWeightKg} kg`
                                                : "—"}
                                            </td>
                                            <td className="py-2 px-3 text-center font-sans">
                                              {set.isCompleted ? (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-lime-400">
                                                  <CheckCircle weight="fill" className="w-3.5 h-3.5 text-lime-400" /> Done
                                                </span>
                                              ) : (
                                                <span className="text-[11px] text-zinc-500 font-medium">Pending</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION: MEAL PLANS */}
      {activeSection === "meals" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                Personalized Nutrition & Meal Plans
              </h3>
              <p className="text-xs text-zinc-400">
                Nutritional guidance, meal timing, and calorie targets set by your coach.
              </p>
            </div>
            <span className="text-xs font-bold text-lime-400 bg-lime-400/10 border border-lime-400/20 px-3 py-1 rounded-full">
              {mealPlans.length} {mealPlans.length === 1 ? "Plan" : "Plans"}
            </span>
          </div>

          {mealPlans.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 text-center">
              <ForkKnife weight="duotone" className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <h4 className="text-base font-bold text-white mb-1">No Meal Plans Yet</h4>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Your trainer has not assigned a meal plan yet. Once prepared, your daily breakfast, lunch, dinner, and snack routines will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {mealPlans.map((plan) => {
                // Group items by meal type
                const mealGroups: Record<string, typeof plan.items> = {
                  BREAKFAST: [],
                  LUNCH: [],
                  DINNER: [],
                  SNACK: [],
                };
                plan.items.forEach((item) => {
                  const type = (item.mealType || item.meal_type || "BREAKFAST").toUpperCase();
                  if (mealGroups[type]) {
                    mealGroups[type].push(item);
                  } else {
                    mealGroups.SNACK.push(item);
                  }
                });

                return (
                  <div
                    key={plan.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-5"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-zinc-800 pb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-xl font-black text-white uppercase tracking-tight">
                            {plan.title}
                          </h4>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              plan.status === "ACTIVE"
                                ? "bg-lime-400 text-zinc-950"
                                : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {plan.status}
                          </span>
                        </div>
                        {plan.notes && (
                          <p className="text-xs text-zinc-400">{plan.notes}</p>
                        )}
                      </div>

                      {plan.dailyCalorieTarget && (
                        <div className="bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-xl text-right">
                          <span className="text-[10px] text-zinc-500 uppercase block">Daily Calorie Target</span>
                          <span className="text-base font-black text-lime-400">{plan.dailyCalorieTarget} kcal</span>
                        </div>
                      )}
                    </div>

                    {/* Meal Types Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const).map((type) => {
                        const items = mealGroups[type];
                        if (items.length === 0) return null;

                        const labels = {
                          BREAKFAST: "Breakfast",
                          LUNCH: "Lunch",
                          DINNER: "Dinner",
                          SNACK: "Snacks & Supplements",
                        };

                        return (
                          <div
                            key={type}
                            className="bg-zinc-950/70 border border-zinc-800 rounded-2xl p-4 space-y-3"
                          >
                            <span className="text-xs font-bold uppercase tracking-wider text-lime-400 flex items-center gap-1.5 border-b border-zinc-850 pb-2">
                              <ForkKnife weight="fill" className="w-3.5 h-3.5 text-lime-400" />
                              {labels[type]}
                            </span>

                            <div className="space-y-2">
                              {items.map((it, idx) => (
                                <div key={it.id || idx} className="text-xs space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-white">{it.foodName || it.food_name}</span>
                                    {it.portion && (
                                      <span className="text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded text-[11px]">
                                        {it.portion}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                                    {it.calories ? <span>{it.calories} cal</span> : null}
                                    {it.proteinGrams ? <span>• {it.proteinGrams}g P</span> : null}
                                    {it.carbsGrams ? <span>• {it.carbsGrams}g C</span> : null}
                                    {it.fatsGrams ? <span>• {it.fatsGrams}g F</span> : null}
                                  </div>

                                  {(it.nutritionalInstructions || it.instructions) && (
                                    <p className="text-[11px] text-zinc-400 italic">
                                      {it.nutritionalInstructions || it.instructions}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION: EXERCISE VIDEOS */}
      {activeSection === "videos" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                Exercise Technique & Demonstration Videos
              </h3>
              <p className="text-xs text-zinc-400">
                Exclusive demonstration videos uploaded by your coach to guide proper form.
              </p>
            </div>
            <span className="text-xs font-bold text-lime-400 bg-lime-400/10 border border-lime-400/20 px-3 py-1 rounded-full">
              {exerciseVideos.length} {exerciseVideos.length === 1 ? "Video" : "Videos"}
            </span>
          </div>

          {exerciseVideos.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 text-center">
              <VideoCamera weight="duotone" className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <h4 className="text-base font-bold text-white mb-1">No Videos Uploaded Yet</h4>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Your trainer has not uploaded form demonstration videos yet. Videos added by your coach will be streamable here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exerciseVideos.map((vid) => {
                const streamUrl = videoSignedUrls[vid.id];

                return (
                  <div
                    key={vid.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl flex flex-col justify-between"
                  >
                    <div className="relative aspect-video bg-zinc-950 flex items-center justify-center group overflow-hidden">
                      {streamUrl ? (
                        <video
                          src={streamUrl}
                          controls
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-6 text-center">
                          <button
                            onClick={() => {
                              if (streamUrl) {
                                setActiveVideoModal({ url: streamUrl, title: vid.title, description: vid.description });
                              }
                            }}
                            className="w-12 h-12 rounded-full bg-lime-400/10 border border-lime-400/30 text-lime-400 flex items-center justify-center mb-2"
                          >
                            <Play weight="fill" className="w-5 h-5 ml-0.5" />
                          </button>
                          <span className="text-xs text-zinc-400">Loading secure video player...</span>
                        </div>
                      )}
                    </div>

                    <div className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-base font-bold text-white uppercase tracking-tight">
                          {vid.title}
                        </h4>
                        {vid.durationSeconds && (
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded">
                            {Math.floor(vid.durationSeconds / 60)}:{(vid.durationSeconds % 60).toString().padStart(2, "0")}
                          </span>
                        )}
                      </div>

                      {vid.description && (
                        <p className="text-xs text-zinc-400 line-clamp-2">{vid.description}</p>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-zinc-800/60">
                        <span>
                          Uploaded: {new Date(vid.createdAt).toLocaleDateString()}
                        </span>
                        {streamUrl && (
                          <a
                            href={streamUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-lime-400 hover:underline font-bold"
                          >
                            Open Player
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION: PROGRESS LOGS */}
      {activeSection === "progress" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                Fitness Progress & Body Metrics
              </h3>
              <p className="text-xs text-zinc-400">
                Body measurements, weigh-in history, and strength PRs recorded by your coach.
              </p>
            </div>
            <span className="text-xs font-bold text-lime-400 bg-lime-400/10 border border-lime-400/20 px-3 py-1 rounded-full">
              {progressRecords.length} {progressRecords.length === 1 ? "Log" : "Logs"}
            </span>
          </div>

          {progressRecords.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 text-center">
              <TrendUp weight="duotone" className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <h4 className="text-base font-bold text-white mb-1">No Progress Records Yet</h4>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Your trainer will record periodic weight measurements, body composition, and strength milestones here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {progressRecords.map((rec) => (
                <div
                  key={rec.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-lime-400" />
                      {new Date(rec.recordedDate).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>

                    <div className="flex items-center gap-3">
                      {rec.weightKg ? (
                        <span className="text-sm font-black text-lime-400 bg-lime-400/10 px-3 py-1 rounded-full border border-lime-400/20">
                          Weight: {rec.weightKg} kg
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500 font-mono">Weight: —</span>
                      )}
                      {rec.bodyFatPercentage && (
                        <span className="text-xs font-bold text-zinc-300 bg-zinc-800 px-2.5 py-1 rounded-full">
                          {rec.bodyFatPercentage}% Body Fat
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Core Simplified Fields: Strength & General Notes */}
                  <div className="bg-zinc-950/90 p-4 rounded-2xl border border-zinc-800 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-lime-400">
                        Strength Progress:
                      </span>
                      <span className="text-white font-medium text-xs">
                        {rec.workoutPerformance || (rec.benchPressMaxKg ? `Bench: ${rec.benchPressMaxKg}kg` : "—")}
                      </span>
                    </div>

                    {rec.notes && (
                      <div className="pt-2 border-t border-zinc-850">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-0.5">
                          General Notes:
                        </span>
                        <p className="text-xs text-zinc-300 leading-relaxed">{rec.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Body Measurements */}
                  {(rec.chestCm || rec.waistCm || rec.hipsCm || rec.armsCm || rec.thighsCm) && (
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-2">
                        Circumference Measurements (cm)
                      </span>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
                        {rec.chestCm && (
                          <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                            <span className="text-[10px] text-zinc-500 uppercase block">Chest</span>
                            <span className="text-xs font-bold text-white">{rec.chestCm} cm</span>
                          </div>
                        )}
                        {rec.waistCm && (
                          <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                            <span className="text-[10px] text-zinc-500 uppercase block">Waist</span>
                            <span className="text-xs font-bold text-white">{rec.waistCm} cm</span>
                          </div>
                        )}
                        {rec.hipsCm && (
                          <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                            <span className="text-[10px] text-zinc-500 uppercase block">Hips</span>
                            <span className="text-xs font-bold text-white">{rec.hipsCm} cm</span>
                          </div>
                        )}
                        {rec.armsCm && (
                          <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                            <span className="text-[10px] text-zinc-500 uppercase block">Arms</span>
                            <span className="text-xs font-bold text-white">{rec.armsCm} cm</span>
                          </div>
                        )}
                        {rec.thighsCm && (
                          <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                            <span className="text-[10px] text-zinc-500 uppercase block">Thighs</span>
                            <span className="text-xs font-bold text-white">{rec.thighsCm} cm</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Strength PRs */}
                  {(rec.benchPressMaxKg || rec.squatMaxKg || rec.deadliftMaxKg) && (
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-2">
                        Strength 1RM Milestones (kg)
                      </span>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {rec.benchPressMaxKg && (
                          <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                            <span className="text-[10px] text-zinc-500 uppercase block">Bench Press</span>
                            <span className="text-xs font-black text-lime-400">{rec.benchPressMaxKg} kg</span>
                          </div>
                        )}
                        {rec.squatMaxKg && (
                          <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                            <span className="text-[10px] text-zinc-500 uppercase block">Squat</span>
                            <span className="text-xs font-black text-lime-400">{rec.squatMaxKg} kg</span>
                          </div>
                        )}
                        {rec.deadliftMaxKg && (
                          <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                            <span className="text-[10px] text-zinc-500 uppercase block">Deadlift</span>
                            <span className="text-xs font-black text-lime-400">{rec.deadliftMaxKg} kg</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Observations & Feedback */}
                  {(rec.workoutPerformance || rec.notes) && (
                    <div className="bg-zinc-950/80 p-3 rounded-2xl border border-zinc-800/80 space-y-1.5 text-xs">
                      {rec.workoutPerformance && (
                        <p className="text-zinc-200">
                          <strong className="text-white">Performance Note: </strong>
                          {rec.workoutPerformance}
                        </p>
                      )}
                      {rec.notes && (
                        <p className="text-zinc-400 italic">
                          <strong className="text-zinc-300 not-italic">Coach Recommendations: </strong>
                          {rec.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Video Modal Player */}
      {activeVideoModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden max-w-3xl w-full shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                {activeVideoModal.title}
              </h4>
              <button
                onClick={() => setActiveVideoModal(null)}
                className="text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider"
              >
                Close
              </button>
            </div>
            <div className="aspect-video bg-black">
              <video
                src={activeVideoModal.url}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
            {activeVideoModal.description && (
              <div className="p-4 bg-zinc-950 text-xs text-zinc-400">
                {activeVideoModal.description}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
