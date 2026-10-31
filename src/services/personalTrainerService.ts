import { supabase } from "../integrations/supabase/client";
import type { CustomerCategory } from "../types";

const ptDb = supabase as any;

export interface ActiveTrainer {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  specialization: string;
  isActive: boolean;
  activeMembersCount: number;
}

export interface TrainerMonitoringMember {
  id?: string;
  customerId: string;
  customer_id?: string;
  customerCode: string;
  customer_code?: string;
  customerName: string;
  customer_name?: string;
  phone: string;
  status: string;
  startDate: string;
  assigned_at?: string;
  endDate: string | null;
  planName: string | null;
  plan_name?: string | null;
  membershipStatus: string | null;
  membership_status?: string | null;
  membershipEnd: string | null;
  membership_end_date?: string | null;
}

export interface TrainerMonitoringRecord {
  id: string;
  userId: string;
  fullName: string;
  full_name?: string;
  phone: string;
  specialization: string;
  isActive: boolean;
  is_active?: boolean;
  loginId: string | null;
  login_id?: string | null;
  email: string | null;
  activeMembersCount: number;
  active_members_count?: number;
  expiredMembersCount: number;
  expired_members_count?: number;
  totalTrainerRevenue: number;
  total_trainer_revenue?: number;
  assignments: TrainerMonitoringMember[];
}

export interface AdminTrainerMonitoringData {
  summary: {
    totalTrainers: number;
    total_trainers?: number;
    activeTrainers: number;
    active_trainers?: number;
    currentTrainerFee: number;
    totalTrainerRevenue: number;
    total_trainer_revenue?: number;
  };
  trainers: TrainerMonitoringRecord[];
}

export interface TrainerDashboardOverview {
  trainerId: string;
  totalAssigned: number;
  total_assigned?: number;
  activeMembers: number;
  active_members?: number;
  expiredMembers: number;
  expired_members?: number;
  followUpNeeded: number;
  follow_up_needed?: number;
  recentActivity: Array<{
    activityType: "GYM_ATTENDANCE" | "PT_SESSION";
    id: string;
    customerId: string;
    customerName: string;
    customerCode: string;
    activityTimestamp: string;
    details: string;
  }>;
  recent_activity?: Array<{
    activityType: "GYM_ATTENDANCE" | "PT_SESSION";
    id: string;
    customerId: string;
    customerName: string;
    customerCode: string;
    activityTimestamp: string;
    details: string;
  }>;
}

export interface AssignedMemberRecord {
  id: string;
  customer_id?: string;
  customerCode: string;
  customer_code?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  customer_name?: string;
  phone: string;
  email: string | null;
  category: CustomerCategory;
  status: string;
  membershipStatus?: string;
  membership_status?: string;
  planName?: string;
  plan_name?: string;
  membershipEndDate?: string | null;
  membership_end_date?: string | null;
  assignedAt?: string;
  assigned_at?: string;
  membership: {
    id: string;
    planName: string;
    startDate: string;
    endDate: string;
    status: string;
    daysRemaining: number;
    isExpired: boolean;
  } | null;
  assignment: {
    id: string;
    startDate: string;
    status: string;
    monthlyFee: number;
    notes: string | null;
  };
}

export interface WorkoutExercise {
  id?: string;
  workoutPlanId?: string;
  dayOfWeek: string;
  day_of_week?: string;
  exerciseName: string;
  exercise_name?: string;
  sets: number;
  reps: number | string;
  durationSeconds?: number;
  duration_seconds?: number | null;
  restSeconds?: number;
  rest_interval_seconds?: number | null;
  instructions?: string;
  videoUrl?: string;
  orderIndex: number;
}

export interface WorkoutPlan {
  id: string;
  customerId: string | null;
  trainerId: string;
  title: string;
  description: string | null;
  startDate: string;
  start_date?: string;
  endDate: string | null;
  end_date?: string | null;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  isTemplate: boolean;
  createdAt: string;
  exercises: WorkoutExercise[];
}

export interface MealItem {
  id?: string;
  mealPlanId?: string;
  mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK" | string;
  meal_type?: string;
  foodName: string;
  food_name?: string;
  portion: string;
  calories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatsGrams?: number;
  nutritionalInstructions?: string;
  instructions?: string;
  orderIndex: number;
}

export interface MealPlan {
  id: string;
  customerId: string | null;
  trainerId: string;
  title: string;
  startDate: string;
  start_date?: string;
  endDate: string | null;
  end_date?: string | null;
  dailyCalorieTarget: number | null;
  daily_calories?: number | null;
  notes: string | null;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  isTemplate: boolean;
  createdAt: string;
  items: MealItem[];
}

export interface ExerciseVideo {
  id: string;
  trainerId: string;
  title: string;
  description: string | null;
  storagePath: string;
  fileSizeBytes: number | null;
  mimeType: string | null;
  durationSeconds: number | null;
  createdAt: string;
  signedUrl?: string;
}

export interface MemberProgressRecord {
  id: string;
  customerId: string;
  trainerId: string;
  recordedDate: string;
  weightKg?: number | null;
  bodyFatPercentage?: number | null;
  chestCm?: number | null;
  waistCm?: number | null;
  hipsCm?: number | null;
  armsCm?: number | null;
  thighsCm?: number | null;
  benchPressMaxKg?: number | null;
  squatMaxKg?: number | null;
  deadliftMaxKg?: number | null;
  workoutPerformance?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface PersonalTrainingSession {
  id: string;
  customerId: string;
  trainerId: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number;
  sessionFocus: string;
  performanceNotes: string | null;
  status: "COMPLETED" | "CANCELLED" | "NO_SHOW";
  createdAt: string;
}

// ----------------------------------------------------------------------------
// 1. Fee Configuration & Active Trainers (Admin & Reception)
// ----------------------------------------------------------------------------

/**
 * Retrieves the currently configured monthly trainer fee from Supabase.
 */
export async function fetchMonthlyTrainerFee(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_monthly_trainer_fee");
  if (error) {
    console.error("Failed to fetch monthly trainer fee:", error);
    // Fall back to settings table select
    const { data: setRow } = await ptDb
      .from("settings")
      .select("monthly_trainer_fee")
      .limit(1)
      .maybeSingle();
    return Number(setRow?.monthly_trainer_fee) || 500;
  }
  return Number(data) || 500;
}

/**
 * Admin updates the monthly personal trainer fee.
 */
export async function adminSetMonthlyTrainerFee(fee: number): Promise<number> {
  if (fee <= 0) {
    throw new Error("Monthly trainer fee must be a positive number.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("admin_set_monthly_trainer_fee", {
    p_fee: fee,
  });
  if (error) {
    console.error("Failed to update monthly trainer fee:", error);
    throw new Error(error.message || "Failed to update monthly trainer fee.");
  }
  return Number(data);
}

/**
 * Retrieves list of all active trainers available for registration and assignment.
 */
export async function fetchActiveTrainers(): Promise<ActiveTrainer[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_active_trainers_list");
  if (error) {
    console.error("Failed to fetch active trainers list:", error);
    // Fallback to direct query
    const { data: tpRows, error: tpError } = await supabase
      .from("trainer_profiles")
      .select("id, user_id, first_name, last_name, phone, specialization, is_active")
      .eq("is_active", true)
      .order("first_name", { ascending: true });

    if (tpError) throw new Error(tpError.message);
    return (tpRows || []).map((tp) => ({
      id: tp.id,
      userId: tp.user_id,
      fullName: `${tp.first_name || ""} ${tp.last_name || ""}`.trim() || "Trainer",
      phone: tp.phone || "",
      specialization: tp.specialization || "Fitness Trainer",
      isActive: tp.is_active,
      activeMembersCount: 0,
    }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    phone: row.phone || "",
    specialization: row.specialization || "Fitness Trainer",
    isActive: row.is_active,
    activeMembersCount: Number(row.active_members_count) || 0,
  }));
}

// ----------------------------------------------------------------------------
// 2. Trainer Assignments Management (Admin & Reception)
// ----------------------------------------------------------------------------

/**
 * Reassigns a member to another personal trainer. Closes previous assignment and keeps subscription paid.
 */
export async function changeCustomerTrainer(
  customerId: string,
  newTrainerId: string,
  reason?: string
): Promise<{ success: boolean; newAssignmentId?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("change_customer_personal_trainer", {
    p_customer_id: customerId,
    p_new_trainer_id: newTrainerId,
    p_reason: reason || null,
  });

  if (error) {
    console.error("change_customer_personal_trainer error:", error);
    throw new Error(error.message || "Failed to change personal trainer.");
  }
  return { success: true, newAssignmentId: data?.new_assignment_id };
}

/**
 * Stops personal training for a member. Preserves history and excludes trainer fee from future renewals.
 */
export async function stopCustomerPersonalTraining(
  customerId: string,
  reason?: string
): Promise<{ success: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("stop_customer_personal_training", {
    p_customer_id: customerId,
    p_reason: reason || null,
  });

  if (error) {
    console.error("stop_customer_personal_training error:", error);
    throw new Error(error.message || "Failed to stop personal training.");
  }
  return { success: Boolean(data?.success) };
}

/**
 * Fetches admin trainer monitoring metrics and assignments.
 */
export async function fetchAdminTrainerMonitoring(): Promise<AdminTrainerMonitoringData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_admin_trainer_monitoring_data");
  if (error) {
    console.error("get_admin_trainer_monitoring_data error:", error);
    throw new Error(error.message || "Failed to load trainer monitoring data.");
  }

  const rawSummary = data?.summary || {};
  const rawTrainers = data?.trainers || [];

  return {
    summary: {
      totalTrainers: Number(rawSummary.total_trainers) || 0,
      total_trainers: Number(rawSummary.total_trainers) || 0,
      activeTrainers: Number(rawSummary.active_trainers) || 0,
      active_trainers: Number(rawSummary.active_trainers) || 0,
      currentTrainerFee: Number(rawSummary.current_trainer_fee) || 500,
      totalTrainerRevenue: Number(rawSummary.total_trainer_revenue) || 0,
      total_trainer_revenue: Number(rawSummary.total_trainer_revenue) || 0,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trainers: rawTrainers.map((t: any) => ({
      id: t.id,
      userId: t.user_id,
      fullName: t.full_name,
      full_name: t.full_name,
      phone: t.phone,
      specialization: t.specialization,
      isActive: Boolean(t.is_active),
      is_active: Boolean(t.is_active),
      loginId: t.login_id,
      login_id: t.login_id,
      email: t.email,
      activeMembersCount: Number(t.active_members_count) || 0,
      active_members_count: Number(t.active_members_count) || 0,
      expiredMembersCount: Number(t.expired_members_count) || 0,
      expired_members_count: Number(t.expired_members_count) || 0,
      totalTrainerRevenue: Number(t.total_trainer_revenue) || 0,
      total_trainer_revenue: Number(t.total_trainer_revenue) || 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assignments: (t.assignments || []).map((a: any) => ({
        id: a.customer_id,
        customerId: a.customer_id,
        customer_id: a.customer_id,
        customerCode: a.customer_code,
        customer_code: a.customer_code,
        customerName: a.customer_name,
        customer_name: a.customer_name,
        phone: a.phone,
        status: a.status,
        startDate: a.start_date,
        assigned_at: a.start_date,
        endDate: a.end_date,
        planName: a.plan_name,
        plan_name: a.plan_name,
        membershipStatus: a.membership_status,
        membership_status: a.membership_status,
        membershipEnd: a.membership_end,
        membership_end_date: a.membership_end,
      })),
    })),
  };
}

// ----------------------------------------------------------------------------
// 3. Trainer Dashboard Overview & Assigned Members
// ----------------------------------------------------------------------------

/**
 * Fetches high-level metrics and activity for the trainer dashboard.
 */
export async function fetchTrainerDashboardOverview(
  trainerId?: string
): Promise<TrainerDashboardOverview> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_trainer_dashboard_overview", {
    p_trainer_id: trainerId || null,
  });

  if (error) {
    console.error("get_trainer_dashboard_overview error:", error);
    throw new Error(error.message || "Unable to load trainer dashboard metrics.");
  }

  const recActivity = (data.recent_activity || []).map((a: any) => ({
    activityType: a.activity_type,
    id: a.id,
    customerId: a.customer_id,
    customerName: a.customer_name,
    customerCode: a.customer_code,
    activityTimestamp: a.activity_timestamp,
    details: a.details,
  }));

  return {
    trainerId: data.trainer_id,
    totalAssigned: Number(data.total_assigned) || 0,
    total_assigned: Number(data.total_assigned) || 0,
    activeMembers: Number(data.active_members) || 0,
    active_members: Number(data.active_members) || 0,
    expiredMembers: Number(data.expired_members) || 0,
    expired_members: Number(data.expired_members) || 0,
    followUpNeeded: Number(data.follow_up_needed) || 0,
    follow_up_needed: Number(data.follow_up_needed) || 0,
    recentActivity: recActivity,
    recent_activity: recActivity,
  };
}

/**
 * Fetches all members currently assigned to the given trainer.
 */
export async function fetchTrainerAssignedMembers(
  trainerId?: string
): Promise<AssignedMemberRecord[]> {
  let effectiveTrainerId = trainerId;
  if (!effectiveTrainerId) {
    const { data: userAuth } = await supabase.auth.getUser();
    if (userAuth?.user) {
      const { data: tp } = await ptDb
        .from("trainer_profiles")
        .select("id")
        .eq("user_id", userAuth.user.id)
        .maybeSingle();
      effectiveTrainerId = (tp as any)?.id;
    }
  }

  if (!effectiveTrainerId) {
    return [];
  }

  const { data: assignments, error } = await ptDb
    .from("trainer_assignments")
    .select(`
      id,
      customer_id,
      status,
      start_date,
      monthly_fee_at_assignment,
      notes,
      customers (
        id,
        customer_code,
        first_name,
        last_name,
        phone,
        email,
        customer_type,
        status
      )
    `)
    .eq("trainer_id", effectiveTrainerId)
    .eq("status", "ACTIVE")
    .order("start_date", { ascending: false });

  if (error) {
    console.error("fetchTrainerAssignedMembers error:", error);
    throw new Error(error.message || "Failed to load assigned members.");
  }

  if (!assignments || assignments.length === 0) {
    return [];
  }

  // Fetch memberships for these customers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customerIds = assignments.map((a: any) => a.customer_id);
  const { data: memberships } = await supabase
    .from("memberships")
    .select(`
      id,
      customer_id,
      status,
      start_date,
      end_date,
      plans (
        name
      )
    `)
    .in("customer_id", customerIds)
    .order("end_date", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return assignments.map((a: any) => {
    const cust = Array.isArray(a.customers) ? a.customers[0] : a.customers;
    const m = (memberships || []).find((mem: any) => mem.customer_id === a.customer_id);
    const planName = m?.plans ? (Array.isArray(m.plans) ? m.plans[0]?.name : (m.plans as any).name) : "Standard Membership";

    let daysRemaining = 0;
    let isExpired = true;
    if (m?.end_date) {
      const msDiff = new Date(m.end_date).getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(msDiff / 86400000));
      isExpired = daysRemaining <= 0;
    }

    const cid = cust?.id || a.customer_id;
    const ccode = cust?.customer_code || "—";
    const fname = `${cust?.first_name || ""} ${cust?.last_name || ""}`.trim() || "Member";
    const mStatus = m?.status || "INACTIVE";
    const mEnd = m?.end_date || null;
    const aStart = a.start_date;

    return {
      id: cid,
      customer_id: cid,
      customerCode: ccode,
      customer_code: ccode,
      firstName: cust?.first_name || "",
      lastName: cust?.last_name || "",
      fullName: fname,
      customer_name: fname,
      phone: cust?.phone || "",
      email: cust?.email || null,
      category: (cust?.customer_type || "REGULAR") as CustomerCategory,
      status: cust?.status || "ACTIVE",
      membershipStatus: mStatus,
      membership_status: mStatus,
      planName,
      plan_name: planName,
      membershipEndDate: mEnd,
      membership_end_date: mEnd,
      assignedAt: aStart,
      assigned_at: aStart,
      membership: m ? {
        id: m.id,
        planName,
        startDate: m.start_date,
        endDate: m.end_date,
        status: m.status,
        daysRemaining,
        isExpired,
      } : null,
      assignment: {
        id: a.id,
        startDate: a.start_date,
        status: a.status,
        monthlyFee: Number(a.monthly_fee_at_assignment) || 0,
        notes: a.notes,
      },
    };
  });
}

// ----------------------------------------------------------------------------
// 4. Workout Plans & Exercises Management
// ----------------------------------------------------------------------------

export async function fetchMemberWorkoutPlans(customerId: string): Promise<WorkoutPlan[]> {
  const { data, error } = await supabase
    .from("workout_plans")
    .select(`
      id,
      customer_id,
      trainer_id,
      title,
      description,
      start_date,
      end_date,
      status,
      is_template,
      created_at,
      workout_exercises (
        id,
        workout_plan_id,
        day_of_week,
        exercise_name,
        sets,
        reps,
        duration_seconds,
        rest_seconds,
        instructions,
        video_url,
        order_index
      )
    `)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchMemberWorkoutPlans error:", error);
    throw new Error(error.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((p: any) => ({
    id: p.id,
    customerId: p.customer_id,
    trainerId: p.trainer_id,
    title: p.title,
    description: p.description,
    startDate: p.start_date,
    start_date: p.start_date,
    endDate: p.end_date,
    end_date: p.end_date,
    status: p.status,
    isTemplate: Boolean(p.is_template),
    createdAt: p.created_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exercises: (p.workout_exercises || [])
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((e: any) => ({
        id: e.id,
        workoutPlanId: e.workout_plan_id,
        dayOfWeek: e.day_of_week,
        day_of_week: e.day_of_week,
        exerciseName: e.exercise_name,
        exercise_name: e.exercise_name,
        sets: Number(e.sets) || 3,
        reps: e.reps || 10,
        durationSeconds: e.duration_seconds ? Number(e.duration_seconds) : undefined,
        duration_seconds: e.duration_seconds ? Number(e.duration_seconds) : null,
        restSeconds: e.rest_seconds ? Number(e.rest_seconds) : undefined,
        rest_interval_seconds: e.rest_seconds ? Number(e.rest_seconds) : null,
        instructions: e.instructions || "",
        videoUrl: e.video_url || undefined,
        orderIndex: Number(e.order_index) || 0,
      })),
  }));
}

export async function createWorkoutPlan(params: {
  customerId: string;
  trainerId: string;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  status?: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  exercises: Omit<WorkoutExercise, "id" | "workoutPlanId">[];
}): Promise<string> {
  const { data: plan, error: planError } = await ptDb
    .from("workout_plans")
    .insert({
      customer_id: params.customerId,
      trainer_id: params.trainerId,
      title: params.title.trim(),
      description: params.description?.trim() || null,
      start_date: params.startDate || new Date().toISOString().split("T")[0],
      end_date: params.endDate || null,
      status: params.status || "ACTIVE",
    })
    .select("id")
    .single();

  if (planError || !plan) {
    console.error("createWorkoutPlan error:", planError);
    throw new Error(planError?.message || "Failed to create workout plan.");
  }

  if (params.exercises.length > 0) {
    const exerciseRows = params.exercises.map((ex, idx) => ({
      workout_plan_id: (plan as any).id,
      day_of_week: ex.dayOfWeek || ex.day_of_week || "Day 1",
      exercise_name: (ex.exerciseName || ex.exercise_name || "").trim(),
      sets: ex.sets || 3,
      reps: ex.reps || 10,
      duration_seconds: ex.durationSeconds ?? ex.duration_seconds ?? 0,
      rest_seconds: ex.restSeconds ?? ex.rest_interval_seconds ?? 60,
      instructions: ex.instructions?.trim() || null,
      video_url: ex.videoUrl?.trim() || null,
      order_index: idx,
    }));

    const { error: exError } = await ptDb.from("workout_exercises").insert(exerciseRows);
    if (exError) {
      console.error("createWorkoutExercises error:", exError);
    }
  }

  return (plan as any).id;
}

export async function updateWorkoutPlanStatus(
  planId: string,
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED"
): Promise<void> {
  const { error } = await ptDb
    .from("workout_plans")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", planId);

  if (error) throw new Error(error.message);
}

// ----------------------------------------------------------------------------
// 5. Meal Plans Management
// ----------------------------------------------------------------------------

export async function fetchMemberMealPlans(customerId: string): Promise<MealPlan[]> {
  const { data, error } = await supabase
    .from("meal_plans")
    .select(`
      id,
      customer_id,
      trainer_id,
      title,
      start_date,
      end_date,
      daily_calorie_target,
      notes,
      status,
      is_template,
      created_at,
      meal_items (
        id,
        meal_plan_id,
        meal_type,
        food_name,
        portion,
        calories,
        protein_grams,
        carbs_grams,
        fats_grams,
        nutritional_instructions,
        order_index
      )
    `)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchMemberMealPlans error:", error);
    throw new Error(error.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((m: any) => ({
    id: m.id,
    customerId: m.customer_id,
    trainerId: m.trainer_id,
    title: m.title,
    startDate: m.start_date,
    start_date: m.start_date,
    endDate: m.end_date,
    end_date: m.end_date,
    dailyCalorieTarget: m.daily_calorie_target ? Number(m.daily_calorie_target) : null,
    daily_calories: m.daily_calorie_target ? Number(m.daily_calorie_target) : null,
    notes: m.notes,
    status: m.status,
    isTemplate: Boolean(m.is_template),
    createdAt: m.created_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (m.meal_items || [])
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((it: any) => ({
        id: it.id,
        mealPlanId: it.meal_plan_id,
        mealType: it.meal_type,
        meal_type: it.meal_type,
        foodName: it.food_name,
        food_name: it.food_name,
        portion: it.portion || "",
        calories: it.calories ? Number(it.calories) : undefined,
        proteinGrams: it.protein_grams ? Number(it.protein_grams) : undefined,
        carbsGrams: it.carbs_grams ? Number(it.carbs_grams) : undefined,
        fatsGrams: it.fats_grams ? Number(it.fats_grams) : undefined,
        nutritionalInstructions: it.nutritional_instructions || undefined,
        instructions: it.nutritional_instructions || undefined,
        orderIndex: Number(it.order_index) || 0,
      })),
  }));
}

export async function createMealPlan(params: {
  customerId: string;
  trainerId: string;
  title: string;
  dailyCalorieTarget?: number;
  dailyCalories?: number;
  notes?: string;
  startDate?: string;
  endDate?: string;
  status?: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  items: Omit<MealItem, "id" | "mealPlanId">[];
}): Promise<string> {
  const { data: plan, error: planError } = await ptDb
    .from("meal_plans")
    .insert({
      customer_id: params.customerId,
      trainer_id: params.trainerId,
      title: params.title.trim(),
      daily_calorie_target: params.dailyCalorieTarget ?? params.dailyCalories ?? null,
      notes: params.notes?.trim() || null,
      start_date: params.startDate || new Date().toISOString().split("T")[0],
      end_date: params.endDate || null,
      status: params.status || "ACTIVE",
    })
    .select("id")
    .single();

  if (planError || !plan) {
    console.error("createMealPlan error:", planError);
    throw new Error(planError?.message || "Failed to create meal plan.");
  }

  if (params.items.length > 0) {
    const itemRows = params.items.map((it, idx) => ({
      meal_plan_id: (plan as any).id,
      meal_type: it.mealType || it.meal_type || "BREAKFAST",
      food_name: (it.foodName || it.food_name || "").trim(),
      portion: (it.portion || "").trim(),
      calories: it.calories || null,
      protein_grams: it.proteinGrams || null,
      carbs_grams: it.carbsGrams || null,
      fats_grams: it.fatsGrams || null,
      nutritional_instructions: (it.nutritionalInstructions || it.instructions)?.trim() || null,
      order_index: idx,
    }));

    const { error: itError } = await ptDb.from("meal_items").insert(itemRows);
    if (itError) {
      console.error("createMealItems error:", itError);
    }
  }

  return (plan as any).id;
}

// ----------------------------------------------------------------------------
// 6. Exercise Videos Management (Supabase Storage & DB)
// ----------------------------------------------------------------------------

const ALLOWED_VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/ogg"];
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB

export async function uploadExerciseVideo(
  trainerId: string,
  file: File,
  title: string,
  description?: string
): Promise<ExerciseVideo> {
  if (!ALLOWED_VIDEO_MIME_TYPES.includes(file.type)) {
    throw new Error("Invalid video format. Supported formats: MP4, WebM, QuickTime, OGG.");
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error("Video file size exceeds the 50MB limit.");
  }

  const rawExt = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ext = ["mp4", "webm", "mov", "ogg"].includes(rawExt) ? rawExt : "mp4";
  const timestamp = Date.now();
  const randomHex = Math.random().toString(36).substring(2, 10);
  const storagePath = `videos/${trainerId}/${timestamp}_${randomHex}.${ext}`;

  // 1. Upload to trainer-videos bucket
  const { error: uploadError } = await supabase.storage
    .from("trainer-videos")
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    console.error("Video storage upload error:", uploadError);
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  // 2. Insert record in exercise_videos table
  const { data: row, error: dbError } = await ptDb
    .from("exercise_videos")
    .insert({
      trainer_id: trainerId,
      title: title.trim(),
      description: description?.trim() || null,
      storage_path: storagePath,
      file_size_bytes: file.size,
      mime_type: file.type,
    })
    .select()
    .single();

  if (dbError || !row) {
    // Rollback file upload
    await supabase.storage.from("trainer-videos").remove([storagePath]);
    throw new Error(dbError?.message || "Failed to record exercise video in database.");
  }

  const v = row as any;
  return {
    id: v.id,
    trainerId: v.trainer_id,
    title: v.title,
    description: v.description,
    storagePath: v.storage_path,
    fileSizeBytes: v.file_size_bytes,
    mimeType: v.mime_type,
    durationSeconds: v.duration_seconds,
    createdAt: v.created_at,
  };
}

export async function fetchTrainerExerciseVideos(trainerId: string): Promise<ExerciseVideo[]> {
  const { data, error } = await ptDb
    .from("exercise_videos")
    .select("*")
    .eq("trainer_id", trainerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchTrainerExerciseVideos error:", error);
    throw new Error(error.message);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    trainerId: row.trainer_id,
    title: row.title,
    description: row.description,
    storagePath: row.storage_path,
    fileSizeBytes: row.file_size_bytes,
    mimeType: row.mime_type,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
  }));
}

export async function getExerciseVideoSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("trainer-videos")
    .createSignedUrl(storagePath, 3600); // 1-hour signed access

  if (error || !data?.signedUrl) {
    console.error("createSignedUrl error:", error);
    throw new Error(`Unable to load video: ${error?.message || "Storage error"}`);
  }

  return data.signedUrl;
}

export async function deleteExerciseVideo(videoId: string, storagePath: string): Promise<void> {
  const { error: dbError } = await supabase.from("exercise_videos").delete().eq("id", videoId);
  if (dbError) throw new Error(dbError.message);
  await supabase.storage.from("trainer-videos").remove([storagePath]);
}

// ----------------------------------------------------------------------------
// 7. Member Progress Tracking Management
// ----------------------------------------------------------------------------

export async function fetchMemberProgressRecords(customerId: string): Promise<MemberProgressRecord[]> {
  const { data, error } = await supabase
    .from("member_progress_records")
    .select("*")
    .eq("customer_id", customerId)
    .order("recorded_date", { ascending: false });

  if (error) {
    console.error("fetchMemberProgressRecords error:", error);
    throw new Error(error.message);
  }

  return (data || []).map((r) => ({
    id: r.id,
    customerId: r.customer_id,
    trainerId: r.trainer_id,
    recordedDate: r.recorded_date,
    weightKg: r.weight_kg ? Number(r.weight_kg) : null,
    bodyFatPercentage: r.body_fat_percentage ? Number(r.body_fat_percentage) : null,
    chestCm: r.chest_cm ? Number(r.chest_cm) : null,
    waistCm: r.waist_cm ? Number(r.waist_cm) : null,
    hipsCm: r.hips_cm ? Number(r.hips_cm) : null,
    armsCm: r.arms_cm ? Number(r.arms_cm) : null,
    thighsCm: r.thighs_cm ? Number(r.thighs_cm) : null,
    benchPressMaxKg: r.bench_press_max_kg ? Number(r.bench_press_max_kg) : null,
    squatMaxKg: r.squat_max_kg ? Number(r.squat_max_kg) : null,
    deadliftMaxKg: r.deadlift_max_kg ? Number(r.deadlift_max_kg) : null,
    workoutPerformance: r.workout_performance || null,
    notes: r.notes || null,
    createdAt: r.created_at,
  }));
}

export async function recordMemberProgress(params: {
  customerId: string;
  trainerId: string;
  recordedDate?: string;
  weightKg?: number;
  bodyFatPercentage?: number;
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  armsCm?: number;
  thighsCm?: number;
  benchPressMaxKg?: number;
  squatMaxKg?: number;
  deadliftMaxKg?: number;
  workoutPerformance?: string;
  notes?: string;
}): Promise<string> {
  const { data, error } = await ptDb
    .from("member_progress_records")
    .insert({
      customer_id: params.customerId,
      trainer_id: params.trainerId,
      recorded_date: params.recordedDate || new Date().toISOString().split("T")[0],
      weight_kg: params.weightKg || null,
      body_fat_percentage: params.bodyFatPercentage || null,
      chest_cm: params.chestCm || null,
      waist_cm: params.waistCm || null,
      hips_cm: params.hipsCm || null,
      arms_cm: params.armsCm || null,
      thighs_cm: params.thighsCm || null,
      bench_press_max_kg: params.benchPressMaxKg || null,
      squat_max_kg: params.squatMaxKg || null,
      deadlift_max_kg: params.deadliftMaxKg || null,
      workout_performance: params.workoutPerformance?.trim() || null,
      notes: params.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("recordMemberProgress error:", error);
    throw new Error(error?.message || "Failed to record member progress.");
  }

  return (data as any).id;
}

// ----------------------------------------------------------------------------
// 8. Completed 1-on-1 Personal Training Sessions (Attendance Integration)
// ----------------------------------------------------------------------------

export async function fetchMemberPTSessions(customerId: string): Promise<PersonalTrainingSession[]> {
  const { data, error } = await ptDb
    .from("personal_training_sessions")
    .select("*")
    .eq("customer_id", customerId)
    .order("session_date", { ascending: false });

  if (error) {
    console.error("fetchMemberPTSessions error:", error);
    throw new Error(error.message);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    customerId: row.customer_id,
    trainerId: row.trainer_id,
    sessionDate: row.session_date,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: Number(row.duration_minutes) || 60,
    sessionFocus: row.session_focus,
    performanceNotes: row.performance_notes,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function recordPersonalTrainingSession(params: {
  customerId: string;
  trainerId?: string;
  sessionDate?: string;
  sessionFocus?: string;
  durationMinutes?: number;
  performanceNotes?: string;
  customerFeedback?: string;
}): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("record_personal_training_session", {
    p_customer_id: params.customerId,
    p_session_date: params.sessionDate || new Date().toISOString().split("T")[0],
    p_session_focus: (params.sessionFocus || "1-on-1 Personal Training Session").trim(),
    p_performance_notes: params.performanceNotes?.trim() || null,
    p_duration_minutes: params.durationMinutes || 60,
  });

  if (error) {
    console.error("record_personal_training_session error:", error);
    throw new Error(error.message || "Failed to record personal training session.");
  }

  return data?.session_id;
}

/**
 * Fetches general gym attendance records from public.attendance for a specific member.
 */
export async function fetchMemberGymAttendance(customerId: string): Promise<Array<{
  id: string;
  checkedInAt: string;
  checkInMethod: string;
  notes: string | null;
}>> {
  const { data, error } = await supabase
    .from("attendance")
    .select("id, checked_in_at, check_in_method, notes")
    .eq("customer_id", customerId)
    .order("checked_in_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("fetchMemberGymAttendance error:", error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    checkedInAt: row.checked_in_at,
    checkInMethod: row.check_in_method || "MANUAL",
    notes: row.notes,
  }));
}

export interface MemberAttendanceCombinedItem {
  id: string;
  activity_time: string;
  source: "GYM_CHECKIN" | "PT_SESSION";
  session_focus?: string | null;
  recorded_by_name?: string | null;
  notes?: string | null;
}

/**
 * Combines general gym check-in records and personal training 1-on-1 sessions
 * into a single unified chronological timeline for the coach.
 */
export async function fetchMemberAttendanceHistory(customerId: string): Promise<MemberAttendanceCombinedItem[]> {
  const [gymAtt, ptSessions] = await Promise.all([
    fetchMemberGymAttendance(customerId),
    fetchMemberPTSessions(customerId),
  ]);

  const items: MemberAttendanceCombinedItem[] = [
    ...gymAtt.map(g => ({
      id: g.id,
      activity_time: g.checkedInAt,
      source: "GYM_CHECKIN" as const,
      session_focus: "General Gym Entrance",
      recorded_by_name: "Reception Desk",
      notes: g.notes,
    })),
    ...ptSessions.map(p => ({
      id: p.id,
      activity_time: `${p.sessionDate}T${p.startTime || "10:00:00"}`,
      source: "PT_SESSION" as const,
      session_focus: p.sessionFocus,
      recorded_by_name: "Personal Coach",
      notes: p.performanceNotes,
    })),
  ];

  return items.sort((a, b) => new Date(b.activity_time).getTime() - new Date(a.activity_time).getTime());
}

// ----------------------------------------------------------------------------
// Convenience Aliases for Component Consumers
// ----------------------------------------------------------------------------
export type AdminTrainerMonitoringResult = AdminTrainerMonitoringData;
export type AdminTrainerItem = TrainerMonitoringRecord;
export type AdminTrainerAssignmentItem = TrainerMonitoringMember;
export const fetchAdminTrainerMonitoringData = fetchAdminTrainerMonitoring;

export const fetchAssignedMembers = fetchTrainerAssignedMembers;
export type AssignedMemberItem = AssignedMemberRecord;

export const fetchWorkoutPlans = fetchMemberWorkoutPlans;
export const saveWorkoutPlan = createWorkoutPlan;
export type WorkoutPlanWithExercises = WorkoutPlan;

export const fetchMealPlans = fetchMemberMealPlans;
export const saveMealPlan = createMealPlan;
export type MealPlanWithItems = MealPlan;

export const fetchMemberProgress = fetchMemberProgressRecords;

export const fetchPersonalTrainingSessions = fetchMemberPTSessions;
export const recordCompletedPersonalTrainingSession = recordPersonalTrainingSession;
export type PersonalTrainingSessionItem = PersonalTrainingSession;

export const getVideoSignedUrl = getExerciseVideoSignedUrl;
export type TrainerDashboardOverviewResult = TrainerDashboardOverview;
