import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../integrations/supabase/client";

const trainerDb = supabase as unknown as SupabaseClient;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RealTrainerProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  specialization: string | null;
  specialties: string[];
  isActive: boolean;
  email: string | null;
}

export interface RealTrainerSession {
  id: string;
  classId: string;
  name: string;
  days: string[];
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  timeSlot: string;
  startAt: string;
  endAt: string;
  sessionDate: string;
  capacity: number;
  status: string;
  description: string | null;
  active: boolean;
  enrolledCount: number;
  attendanceCount: number;
  durationHours: number;
}

export interface RealTrainerTrainee {
  id: string;
  bookingId: string;
  customerCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  sessionId: string;
  sessionName: string;
  bookingStatus: string;
  membershipStartDate: string | null;
  membershipEndDate: string | null;
  membershipValid: boolean;
}

export interface TrainerRosterItem extends RealTrainerTrainee {
  customerStatus: string;
  attendanceId: string | null;
  checkedInAt: string | null;
}

export type TrainerProfileState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "unauthorized"; message: string }
  | { status: "not_found"; message: string }
  | {
      status: "success";
      profile: RealTrainerProfile;
      sessions: RealTrainerSession[];
      trainees: RealTrainerTrainee[];
      weeklyHours: number;
      attendanceCount: number;
    };

interface RawTrainerProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  specialization: string | null;
  isActive: boolean;
  email: string | null;
}

interface RawTrainerSchedule {
  id: string;
  classId: string;
  name: string;
  description: string | null;
  startAt: string;
  endAt: string;
  capacity: number | null;
  status: string;
  enrolledCount: number;
  attendanceCount: number;
}

function parseProfile(raw: RawTrainerProfile): RealTrainerProfile {
  const specialties = (raw.specialization ?? "").split(/[&,]/).map(value => value.trim()).filter(Boolean);
  return {
    ...raw,
    fullName: `${raw.firstName} ${raw.lastName}`.trim() || "Trainer",
    specialties,
  };
}

function localDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(value);
}

function parseSchedule(raw: RawTrainerSchedule): RealTrainerSession {
  const start = new Date(raw.startAt);
  const end = new Date(raw.endAt);
  const startTime = start.toLocaleTimeString("en-GB", { timeZone: "Africa/Addis_Ababa", hour: "2-digit", minute: "2-digit" });
  const endTime = end.toLocaleTimeString("en-GB", { timeZone: "Africa/Addis_Ababa", hour: "2-digit", minute: "2-digit" });
  const day = start.toLocaleDateString("en-US", { timeZone: "Africa/Addis_Ababa", weekday: "long" });
  return {
    ...raw,
    days: [day],
    dayOfWeek: day,
    startTime,
    endTime,
    timeSlot: `${startTime} - ${endTime}`,
    sessionDate: localDate(start),
    capacity: Number(raw.capacity ?? 0),
    active: !["CANCELLED", "CANCELED", "COMPLETED"].includes(raw.status.toUpperCase()),
    durationHours: Math.max(0, (end.getTime() - start.getTime()) / 3_600_000),
  };
}

function parseTrainee(raw: Record<string, unknown>, sessionId = "", sessionName = ""): RealTrainerTrainee {
  const firstName = String(raw.firstName ?? "");
  const lastName = String(raw.lastName ?? "");
  return {
    id: String(raw.customerId ?? ""),
    bookingId: String(raw.bookingId ?? ""),
    customerCode: String(raw.customerCode ?? ""),
    firstName,
    lastName,
    fullName: String(raw.fullName ?? `${firstName} ${lastName}`.trim()),
    sessionId: String(raw.sessionId ?? sessionId),
    sessionName: String(raw.sessionName ?? sessionName),
    bookingStatus: String(raw.bookingStatus ?? "BOOKED"),
    membershipStartDate: raw.membershipStartDate == null ? null : String(raw.membershipStartDate),
    membershipEndDate: raw.membershipEndDate == null ? null : String(raw.membershipEndDate),
    membershipValid: Boolean(raw.membershipValid),
  };
}

function serviceError(error: { message: string; code?: string; details?: string | null; hint?: string | null }, operation: string): Error {
  // Keep diagnostic detail in the developer console; show only actionable, safe messages in the UI.
  console.error("[TrainerPortal] Database request failed", {
    operation,
    code: error.code ?? "unknown",
    message: error.message,
    details: error.details ?? undefined,
    hint: error.hint ?? undefined,
  });
  switch (error.code) {
    case "42501":
      return new Error(`Trainer access denied. ${error.message}`);
    case "P0001":
      if (/authentication required/i.test(error.message)) return new Error("Your session has expired. Sign in again and retry.");
      if (error.message === "TP_UNAUTHENTICATED") return new Error("You are signed out. Sign in again to open the Trainer Portal.");
      if (error.message === "TP_USER_MAPPING_MISSING") return new Error("Your login is not linked to a gym user account. Ask an administrator to check your account setup.");
      if (error.message === "TP_ROLE_REQUIRED") return new Error("This account does not have the Trainer role.");
      if (error.message === "TP_PROFILE_MISSING") return new Error("No Trainer profile is linked to this account. Ask an administrator to set one up.");
      if (error.message === "TP_ACCOUNT_INACTIVE" || /active trainer account/i.test(error.message)) return new Error("This Trainer account is inactive. Ask an administrator for help.");
      if (/schedule not found|not assigned|booking is not in a schedule/i.test(error.message)) return new Error("That class is no longer available to your account. Refresh the portal and try again.");
      if (/does not have a currently valid membership/i.test(error.message)) return new Error("This member needs a valid membership before attendance can be recorded.");
      if (/blocked or suspended/i.test(error.message)) return new Error("Attendance cannot be recorded for a blocked or suspended member.");
      if (/cancelled bookings/i.test(error.message)) return new Error("Attendance cannot be recorded for a cancelled booking.");
      if (/already been finalized/i.test(error.message)) return new Error("Attendance was already finalized. Refresh the roster to see the latest status.");
      if (/invalid schedule date range|invalid trainer profile values|attendance must be/i.test(error.message)) return new Error("Some submitted details are invalid. Review them and try again.");
      return new Error(`The database rejected the trainer request: ${error.message}`);
    case "23505":
      return new Error("This action has already been recorded. Refresh the portal to see the latest status.");
    case "23514":
      return new Error("The submitted change conflicts with a database rule. Review the details and retry.");
    case "PGRST202":
      return new Error(`Supabase could not resolve public.trainer_portal_dashboard(p_from, p_to). ${error.message}${error.hint ? ` Hint: ${error.hint}` : ""}`);
    case "PGRST203":
      return new Error(`Supabase found an ambiguous Trainer Portal function signature. ${error.message}${error.hint ? ` Hint: ${error.hint}` : ""}`);
    case "PGRST204":
      return new Error(`Supabase's API schema does not match the Trainer Portal request. ${error.message}${error.hint ? ` Hint: ${error.hint}` : ""}`);
    case "PGRST301":
    case "28000":
      return new Error("Your session is no longer valid. Sign in again and retry.");
    default:
      return new Error(`Trainer request failed${error.code ? ` (${error.code})` : ""}: ${error.message}`);
  }
}

/** Read through server-side RPCs; the authenticated identity, role, and ownership are resolved in PostgreSQL. */
export async function fetchTrainerProfileData(userId: string, from: string, to: string): Promise<TrainerProfileState> {
  if (!UUID_REGEX.test(userId)) return { status: "not_found", message: "No authenticated trainer session was found." };
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) {
    console.error("[TrainerPortal] Could not validate the current Supabase session", {
      status: authError.status ?? "unknown",
      code: authError.code ?? "unknown",
    });
    if (authError.status === 401) {
      return { status: "unauthorized", message: "You are not signed in. Sign in with your Trainer account and retry." };
    }
    return { status: "error", error: "We could not validate your sign-in. Check your connection and retry." };
  }
  if (!auth.user) {
    return { status: "unauthorized", message: "You are not signed in. Sign in with your Trainer account and retry." };
  }
  if (auth.user.id !== userId) {
    return { status: "not_found", message: "Your sign-in changed. Refresh the page and retry." };
  }
  const { data, error } = await trainerDb.rpc("trainer_portal_dashboard", { p_from: from, p_to: to });
  if (error) {
    if (error.code === "P0001") {
      console.warn("[TrainerPortal] Dashboard access check rejected", { code: error.code, reason: error.message });
    }
    if (error.code === "P0001" && error.message === "TP_ROLE_REQUIRED") {
      return { status: "unauthorized", message: "This signed-in account does not have the Trainer role." };
    }
    if (error.code === "P0001" && error.message === "TP_ACCOUNT_INACTIVE") {
      return { status: "unauthorized", message: "This Trainer account is inactive. Ask an administrator to reactivate it." };
    }
    if (error.code === "P0001" && error.message === "TP_UNAUTHENTICATED") {
      return { status: "unauthorized", message: "Your session is not authenticated. Sign in again to open the Trainer Portal." };
    }
    if (error.code === "42501") {
      return { status: "unauthorized", message: "Supabase denied this request for the authenticated role. Verify the trainer RPC grants and account status." };
    }
    if (error.code === "P0001" && error.message === "TP_USER_MAPPING_MISSING") {
      return { status: "not_found", message: "Your login is not linked to a gym user account. Ask an administrator to check your account setup." };
    }
    if (error.code === "P0001" && error.message === "TP_PROFILE_MISSING") {
      return { status: "not_found", message: "No Trainer profile is linked to this account. Ask an administrator to set one up." };
    }
    return { status: "error", error: serviceError(error, "trainer_portal_dashboard").message };
  }
  const result = data as { profile: RawTrainerProfile; schedules: RawTrainerSchedule[]; trainees: Array<Record<string, unknown>>; weeklyHours: number; activeTrainees: number; attendanceCount: number } | null;
  if (!result?.profile?.id || !result.profile.isActive) {
    return { status: "not_found", message: "No active Trainer profile is linked to this account." };
  }
  const sessions = (result.schedules ?? []).map(parseSchedule);
  const traineesById = new Map<string, RealTrainerTrainee>();
  for (const raw of result.trainees ?? []) {
    const trainee = parseTrainee(raw);
    if (!traineesById.has(trainee.id)) traineesById.set(trainee.id, trainee);
  }
  const trainees = [...traineesById.values()];
  return {
    status: "success",
    profile: parseProfile(result.profile),
    sessions,
    trainees,
    weeklyHours: Number(result.weeklyHours ?? 0),
    attendanceCount: Number(result.attendanceCount ?? 0),
  };
}

export async function fetchTrainerRoster(scheduleId: string): Promise<TrainerRosterItem[]> {
  if (!UUID_REGEX.test(scheduleId)) throw new Error("Invalid class schedule ID.");
  const { data, error } = await trainerDb.rpc("trainer_portal_roster", { p_schedule_id: scheduleId });
  if (error) throw serviceError(error, "trainer_portal_roster");
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map(raw => ({
    ...parseTrainee(raw),
    customerStatus: String(raw.customerStatus ?? "ACTIVE"),
    attendanceId: raw.attendanceId == null ? null : String(raw.attendanceId),
    checkedInAt: raw.checkedInAt == null ? null : String(raw.checkedInAt),
  }));
}

export async function updateTrainerProfile(input: { firstName: string; lastName: string; phone: string; specialization: string }): Promise<RealTrainerProfile> {
  const { data, error } = await trainerDb.rpc("trainer_update_own_profile", {
    p_first_name: input.firstName.trim(), p_last_name: input.lastName.trim(),
    p_phone: input.phone.trim(), p_specialization: input.specialization.trim(),
  });
  if (error) throw serviceError(error, "trainer_update_own_profile");
  return parseProfile(data as RawTrainerProfile);
}

export async function cancelTrainerSchedule(scheduleId: string): Promise<void> {
  if (!UUID_REGEX.test(scheduleId)) throw new Error("Invalid class schedule ID.");
  const { error } = await trainerDb.rpc("trainer_cancel_own_schedule", { p_schedule_id: scheduleId });
  if (error) throw serviceError(error, "trainer_cancel_own_schedule");
}

export async function recordClassAttendance(bookingId: string, status: "ATTENDED" | "NO_SHOW"): Promise<void> {
  if (!UUID_REGEX.test(bookingId)) throw new Error("Invalid class booking ID.");
  const { error } = await trainerDb.rpc("trainer_record_class_attendance", { p_booking_id: bookingId, p_status: status });
  if (error) throw serviceError(error, "trainer_record_class_attendance");
}

export function getTrainerRange(): { from: string; to: string } {
  const today = localDate(new Date());
  const start = new Date(`${today}T00:00:00+03:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { from: `${today}T00:00:00+03:00`, to: end.toISOString() };
}

export function getTrainerToday(): string {
  return localDate(new Date());
}
