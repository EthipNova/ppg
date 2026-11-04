import type { Member, Plan, Payment, Expense, Visit, EmailLog, StaffUser, GymSettings, AuditLog, Trainer, GymClass, ClassAttendee, TrainerClientNote, CustomerCategory, AccessRule, AerobicsGroup, CategoryLabel, SteamAccess, SteamUsage, Locker, LockerAssignment } from "./types";

export const DEFAULT_SETTINGS: GymSettings = {
  gymName: "Power Plus Gym",
  tagline: "Train Strong. Stay Strong.",
  description: "A premium gym with world-class equipment, expert coaches, and an energetic athletic community.",
  email: "info@powerplus.et",
  phone: "+251 911 234 567",
  address: "Bole Road, Addis Ababa, Ethiopia",
  operatingHours: "Monday to Saturday: 05:00 AM – 11:00 PM | Sunday: 06:00 AM – 09:00 PM",
  inactivityThresholdDays: 14,
  currency: "Br",
  steamEnabled: true,
  steamModel: "both",
  steamPackagePrice: 1500,
  steamPackageDays: 30,
  steamPackageVisits: 10,
  steamPerVisitPrice: 300,
  steamExpiringSoonDays: 5,
};

export const PLANS: Plan[] = [
  { id: "p1", name: "Monthly Essential", price: 1500, durationDays: 30, perks: ["Weight-room access", "Lockers & changing rooms", "Water fountain"], active: true, applicableCategories: ["REGULAR", "STUDENT", "MUSLIM"] },
  { id: "p2", name: "Monthly Premium", price: 2500, durationDays: 30, perks: ["Full access", "Group classes", "Sauna", "Nutrition plan"], active: true, applicableCategories: "ALL" },
  { id: "p3", name: "Quarterly", price: 6500, durationDays: 90, perks: ["Full access", "Group classes", "Sauna", "1 coaching session / week"], active: true, applicableCategories: "ALL" },
  { id: "p4", name: "Annual", price: 22000, durationDays: 365, perks: ["Unlimited access", "Unlimited coaching", "Guest passes", "Shop discount"], active: true, applicableCategories: "ALL" },
  { id: "p5", name: "Aerobics & Dance Pack", price: 1200, durationDays: 30, perks: ["Aerobics classes", "Dance fitness", "Access to class time slots"], active: true, applicableCategories: ["AEROBICS"] },
];

export const MEMBERS: Member[] = [
  { id: "m1", name: "Abebe Kebede", phone: "0911223344", email: "abebe@gmail.com", memberId: "PP-001", planId: "p2", category: "REGULAR", joinDate: "2024-10-01", expiryDate: "2025-08-15", status: "active", lastVisit: "2025-07-28T08:30:00", emergencyContact: "Sara Kebede", emergencyPhone: "0911556677", medicalNotes: "None", emailNotifications: true, balanceDue: 0 },
  { id: "m2", name: "Tigist Alemu", phone: "0922334455", email: "tigist@yahoo.com", memberId: "PP-002", planId: "p1", category: "STUDENT", studentId: "AAU-11842", institution: "Addis Ababa University", studentVerified: true, verifiedBy: "Selam", verifiedAt: "2025-05-10", joinDate: "2025-05-10", expiryDate: "2025-08-01", status: "expiring", lastVisit: "2025-07-25T17:00:00", emergencyContact: "Alemu T", emergencyPhone: "0922889900", medicalNotes: "Mild asthma", emailNotifications: true, balanceDue: 0 },
  { id: "m3", name: "Dawit Tesfaye", phone: "0933445566", email: "dawit.t@gmail.com", memberId: "PP-003", planId: "p3", category: "AEROBICS", aerobicsGroupId: "agp2", joinDate: "2025-01-15", expiryDate: "2025-04-15", status: "expired", lastVisit: "2025-04-10T12:00:00", emergencyContact: "Lily T", emergencyPhone: "0933112233", medicalNotes: "None", emailNotifications: false, balanceDue: 6500 },
  { id: "m4", name: "Hana Girma", phone: "0944556677", email: "hana.g@gmail.com", memberId: "PP-004", planId: "p2", category: "REGULAR", joinDate: "2025-03-01", expiryDate: "2025-08-20", status: "active", lastVisit: "2025-07-10T09:00:00", emergencyContact: "Girma H", emergencyPhone: "0944223344", medicalNotes: "Knee injury - avoid squats", emailNotifications: true, balanceDue: 0 },
  { id: "m5", name: "Yonas Bekele", phone: "0955667788", email: "yonas.b@hotmail.com", memberId: "PP-005", planId: "p4", category: "REGULAR", joinDate: "2024-09-01", expiryDate: "2025-09-01", status: "active", lastVisit: "2025-07-29T06:15:00", emergencyContact: "Bekele Y", emergencyPhone: "0955445566", medicalNotes: "None", emailNotifications: true, balanceDue: 0 },
  { id: "m6", name: "Meron Fikru", phone: "0966778899", email: "meron.f@gmail.com", memberId: "PP-006", planId: "p1", category: "STUDENT", studentId: "STU-2025-4471", institution: "Addis Institute of Technology", studentVerified: false, joinDate: "2025-06-20", expiryDate: "2025-07-20", status: "inactive", lastVisit: "2025-07-05T14:00:00", emergencyContact: "Fikru M", emergencyPhone: "0966334455", medicalNotes: "None", emailNotifications: true, balanceDue: 1500 },
  { id: "m7", name: "Solomon Haile", phone: "0977889900", email: "sol.h@gmail.com", memberId: "PP-007", planId: "p3", category: "MUSLIM", joinDate: "2025-04-01", expiryDate: "2025-07-01", status: "expired", lastVisit: "2025-06-28T11:30:00", emergencyContact: "Haile S", emergencyPhone: "0977556677", medicalNotes: "Diabetic - monitor", emailNotifications: true, balanceDue: 6500 },
  { id: "m8", name: "Rahel Tadesse", phone: "0988990011", email: "rahel.t@gmail.com", memberId: "PP-008", planId: "p2", category: "AEROBICS", aerobicsGroupId: "agp1", joinDate: "2025-07-01", expiryDate: "2025-08-31", status: "active", lastVisit: "2025-07-29T16:45:00", emergencyContact: "Tadesse R", emergencyPhone: "0988667788", medicalNotes: "None", emailNotifications: true, balanceDue: 0 },
];

export const PAYMENTS: Payment[] = [
  { id: "pay1", memberId: "m1", amount: 2500, date: "2025-07-15", method: "telebirr", type: "renewal", note: "Premium monthly renewal" },
  { id: "pay2", memberId: "m2", amount: 1500, date: "2025-07-01", method: "cash", type: "membership", note: "Basic monthly" },
  { id: "pay3", memberId: "m3", amount: 6500, date: "2025-01-15", method: "cbe_birr", type: "membership", note: "Quarterly plan" },
  { id: "pay4", memberId: "m4", amount: 2500, date: "2025-07-20", method: "card", type: "renewal", note: "Premium renewal" },
  { id: "pay5", memberId: "m5", amount: 22000, date: "2024-09-01", method: "telebirr", type: "membership", note: "Annual plan" },
  { id: "pay6", memberId: "m6", amount: 1500, date: "2025-06-20", method: "cash", type: "membership", note: "Basic monthly" },
  { id: "pay7", memberId: "m7", amount: 6500, date: "2025-04-01", method: "cbe_birr", type: "membership", note: "Quarterly" },
  { id: "pay8", memberId: "m8", amount: 2500, date: "2025-07-01", method: "telebirr", type: "membership", note: "Premium monthly" },
  { id: "pay9", memberId: "m1", amount: 2500, date: "2025-06-15", method: "telebirr", type: "renewal", note: "Premium renewal" },
  { id: "pay10", memberId: "m5", amount: 2500, date: "2025-07-10", method: "card", type: "renewal", note: "PT add-on" },
];

export const EXPENSES: Expense[] = [
  { id: "e1", category: "rent", amount: 45000, date: "2025-07-01", description: "Monthly gym rent" },
  { id: "e2", category: "utilities", amount: 8500, date: "2025-07-05", description: "Electricity & water" },
  { id: "e3", category: "salaries", amount: 35000, date: "2025-07-10", description: "Staff salaries July" },
  { id: "e4", category: "equipment", amount: 12000, date: "2025-06-20", description: "New dumbbells set" },
  { id: "e5", category: "maintenance", amount: 5000, date: "2025-07-12", description: "AC repair" },
  { id: "e6", category: "rent", amount: 45000, date: "2025-06-01", description: "Monthly gym rent" },
  { id: "e7", category: "utilities", amount: 7800, date: "2025-06-05", description: "Electricity & water" },
  { id: "e8", category: "salaries", amount: 35000, date: "2025-06-10", description: "Staff salaries June" },
  { id: "e9", category: "equipment", amount: 25000, date: "2025-05-15", description: "Treadmill purchase" },
  { id: "e10", category: "maintenance", amount: 3200, date: "2025-05-20", description: "Plumbing fix" },
];

export const VISITS: Visit[] = [
  { id: "v1", memberId: "m1", category: "REGULAR", accessStatus: "allowed", timestamp: "2025-07-28T08:30:00", checkedInBy: "Selam" },
  { id: "v2", memberId: "m5", category: "REGULAR", accessStatus: "allowed", timestamp: "2025-07-29T06:15:00", checkedInBy: "Selam" },
  { id: "v3", memberId: "m8", category: "AEROBICS", accessStatus: "override", overrideReason: "Private aerobics session — manager override", timestamp: "2025-07-29T16:45:00", checkedInBy: "Selam" },
  { id: "v4", memberId: "m2", category: "STUDENT", accessStatus: "allowed", timestamp: "2025-07-25T17:00:00", checkedInBy: "Selam" },
  { id: "v5", memberId: "m1", category: "REGULAR", accessStatus: "allowed", timestamp: "2025-07-26T09:00:00", checkedInBy: "Selam" },
  { id: "v6", memberId: "m4", category: "REGULAR", accessStatus: "allowed", timestamp: "2025-07-10T09:00:00", checkedInBy: "Selam" },
  { id: "v7", memberId: "m5", category: "REGULAR", accessStatus: "allowed", timestamp: "2025-07-27T06:30:00", checkedInBy: "Selam" },
  { id: "v8", memberId: "m8", category: "AEROBICS", accessStatus: "allowed", timestamp: "2025-07-28T17:00:00", checkedInBy: "Selam" },
  { id: "v9", memberId: "m1", category: "REGULAR", accessStatus: "allowed", timestamp: "2025-07-29T08:00:00", checkedInBy: "Selam" },
  { id: "v10", memberId: "m6", category: "STUDENT", accessStatus: "override", overrideReason: "Student file pending verification", timestamp: "2025-07-05T14:00:00", checkedInBy: "Selam" },
];

export const STAFF: StaffUser[] = [
  { id: "s1", name: "Dawit Owner", email: "owner@powerplus.et", role: "owner", active: true },
  { id: "s2", name: "Selam Receptionist", email: "selam@powerplus.et", role: "staff", active: true },
  { id: "s3", name: "Kebede Trainer", email: "kebede@powerplus.et", role: "staff", active: true },
];

export const EMAIL_LOGS: EmailLog[] = [
  { id: "em1", to: "abebe@gmail.com", toName: "Abebe Kebede", subject: "Welcome to Power Plus Gym!", body: "Hi Abebe, welcome to the Power Plus family! Your Premium membership is active until August 15, 2025.", type: "welcome", sentAt: "2024-10-01T10:00:00", status: "opened" },
  { id: "em2", to: "tigist@yahoo.com", toName: "Tigist Alemu", subject: "Payment receipt — Br 1,500", body: "Hi Tigist, we have received your payment of Br 1,500 for the Monthly Essential membership. Thank you!", type: "receipt", sentAt: "2025-07-01T12:00:00", status: "delivered" },
  { id: "em3", to: "dawit.t@gmail.com", toName: "Dawit Tesfaye", subject: "Your membership expires in 7 days", body: "Hi Dawit, your quarterly membership expires on April 15. Renew now to avoid any interruption.", type: "reminder", sentAt: "2025-04-08T09:00:00", status: "opened" },
  { id: "em4", to: "meron.f@gmail.com", toName: "Meron Fikru", subject: "We miss you at Power Plus!", body: "Hi Meron, more than 14 days have passed since your last visit. Come back and train with us!", type: "inactivity", sentAt: "2025-07-19T10:00:00", status: "sent" },
  { id: "em5", to: "sol.h@gmail.com", toName: "Solomon Haile", subject: "Membership expired", body: "Hi Solomon, your membership expired on July 1. Renew to keep training with us.", type: "expired", sentAt: "2025-07-02T08:00:00", status: "delivered" },
];

export const AUDIT_LOGS: AuditLog[] = [
  { id: "a1", action: "Member Registered", actor: "Selam", timestamp: "2025-07-01T09:00:00", details: "Rahel Tadesse registered (Standard category) — Monthly Premium plan" },
  { id: "a2", action: "Payment Recorded", actor: "Dawit Owner", timestamp: "2025-07-15T14:30:00", details: "Br 2,500 renewal from Abebe Kebede via Telebirr" },
  { id: "a3", action: "Plan Updated", actor: "Dawit Owner", timestamp: "2025-06-01T11:00:00", details: "Annual plan price updated to Br 22,000" },
  { id: "a4", action: "Expense Added", actor: "Selam", timestamp: "2025-07-12T16:00:00", details: "Air-conditioning repair expense Br 5,000" },
];

export const DEMO_CREDENTIALS = {
  owner: { id: "s1", name: "Dawit Owner", role: "owner" as const },
  staff: { id: "s2", name: "Selam", role: "staff" as const },
  member: { id: "m1", name: "Abebe Kebede", role: "member" as const },
  member_regular: { id: "m1", name: "Abebe Kebede", role: "member" as const },
  // TEMPORARY development bridge: maps the Aerobics demo customer to live PP-008 UUID.
  // This will later be replaced by authenticated identity resolution (auth.uid() -> customers.user_id).
  member_aerobics: { id: "11111111-1111-1111-1111-111111111108", name: "Aerobics Member", role: "member" as const },
  trainer: { id: "t1", name: "Kidus Hailu", role: "trainer" as const },
};

export const TRAINERS: Trainer[] = [
  { id: "t1", name: "Kidus Hailu", email: "kidus@powerplus.et", phone: "0911000111", specialties: ["Strength", "HIIT", "Boxing"], bio: "Head trainer. 8 years coaching powerlifting and functional fitness.", active: true, clientIds: ["m1", "m5", "m8"], weeklyHours: 22 },
  { id: "t2", name: "Bethlehem Tesfaye", email: "bethlehem@powerplus.et", phone: "0922000222", specialties: ["Yoga", "Cardio", "Mobility"], bio: "Certified yoga and mobility instructor focused on recovery and flexibility.", active: true, clientIds: ["m2", "m4"], weeklyHours: 16 },
  { id: "t3", name: "Dawit Kassa", email: "dawit.k@powerplus.et", phone: "0933000333", specialties: ["Spin", "HIIT", "Cardio"], bio: "Indoor cycling and high-intensity conditioning specialist.", active: true, clientIds: ["m6", "m7"], weeklyHours: 14 },
];

export const CLASSES: GymClass[] = [
  { id: "c1", title: "Morning Power HIIT", description: "High-intensity interval session to ignite your day.", trainerId: "t1", trainerName: "Kidus Hailu", dayOfWeek: "Monday", time: "06:00 AM - 07:00 AM", room: "Studio A", capacity: 20, category: "HIIT" },
  { id: "c2", title: "Evening Boxing", description: "Heavy-bag rounds, footwork and conditioning.", trainerId: "t1", trainerName: "Kidus Hailu", dayOfWeek: "Wednesday", time: "06:00 PM - 07:00 PM", room: "Ring Zone", capacity: 16, category: "Boxing" },
  { id: "c3", title: "Core & Strength", description: "Compound lifts and core stability circuit.", trainerId: "t1", trainerName: "Kidus Hailu", dayOfWeek: "Friday", time: "05:30 PM - 06:30 PM", room: "Free Weights", capacity: 18, category: "Strength" },
  { id: "c4", title: "Sunrise Yoga Flow", description: "Gentle vinyasa and breathing for mobility.", trainerId: "t2", trainerName: "Bethlehem Tesfaye", dayOfWeek: "Tuesday", time: "07:00 AM - 08:00 AM", room: "Studio B", capacity: 15, category: "Yoga" },
  { id: "c5", title: "Cardio Blast", description: "Treadmill, rower and bike intervals.", trainerId: "t2", trainerName: "Bethlehem Tesfaye", dayOfWeek: "Thursday", time: "06:00 PM - 06:45 PM", room: "Cardio Floor", capacity: 22, category: "Cardio" },
  { id: "c6", title: "Spin Party", description: "Beat-driven indoor cycling with climbs and sprints.", trainerId: "t3", trainerName: "Dawit Kassa", dayOfWeek: "Saturday", time: "09:00 AM - 09:45 AM", room: "Spin Room", capacity: 24, category: "Spin" },
  { id: "c7", title: "Weekend Shred", description: "Full-body metabolic conditioning.", trainerId: "t3", trainerName: "Dawit Kassa", dayOfWeek: "Sunday", time: "08:00 AM - 09:00 AM", room: "Studio A", capacity: 20, category: "HIIT" },
];

export const CLASS_ATTENDEES: ClassAttendee[] = [
  { id: "ca1", classId: "c1", memberId: "m1", memberName: "Abebe Kebede", memberPhone: "0911223344", attended: true, date: "2025-07-28" },
  { id: "ca2", classId: "c1", memberId: "m5", memberName: "Yonas Bekele", memberPhone: "0955667788", attended: true, date: "2025-07-28" },
  { id: "ca3", classId: "c1", memberId: "m8", memberName: "Rahel Tadesse", memberPhone: "0988990011", attended: false, date: "2025-07-28" },
  { id: "ca4", classId: "c2", memberId: "m1", memberName: "Abebe Kebede", memberPhone: "0911223344", attended: true, date: "2025-07-30" },
  { id: "ca5", classId: "c2", memberId: "m5", memberName: "Yonas Bekele", memberPhone: "0955667788", attended: true, date: "2025-07-30" },
  { id: "ca6", classId: "c3", memberId: "m8", memberName: "Rahel Tadesse", memberPhone: "0988990011", attended: false, date: "2025-08-01" },
  { id: "ca7", classId: "c3", memberId: "m1", memberName: "Abebe Kebede", memberPhone: "0911223344", attended: true, date: "2025-08-01" },
  { id: "ca8", classId: "c4", memberId: "m2", memberName: "Tigist Alemu", memberPhone: "0922334455", attended: true, date: "2025-07-29" },
  { id: "ca9", classId: "c4", memberId: "m4", memberName: "Hana Girma", memberPhone: "0944556677", attended: false, date: "2025-07-29" },
  { id: "ca10", classId: "c6", memberId: "m6", memberName: "Meron Fikru", memberPhone: "0966778899", attended: false, date: "2025-08-02" },
];

export const TRAINER_CLIENT_NOTES: TrainerClientNote[] = [
  { id: "n1", trainerId: "t1", memberId: "m1", date: "2025-07-28", workoutFocus: "Deadlift PR attempt", notes: "Hit 140kg for 3 reps. Form solid, add belt next session." },
  { id: "n2", trainerId: "t1", memberId: "m5", date: "2025-07-28", workoutFocus: "Hypertrophy - push day", notes: "Bench 4x8. Fatigue in last set, reduce volume slightly." },
  { id: "n3", trainerId: "t1", memberId: "m8", date: "2025-07-25", workoutFocus: "Conditioning circuit", notes: "Great energy, monitor knee during box jumps." },
];

export const EMAIL_TEMPLATES = [
  { name: "Payment reminder", subject: "Your payment is due", body: "Hi {name}, your payment of {amount} is due. Visit reception or pay online." },
  { name: "Welcome message", subject: "Welcome to Power Plus Gym!", body: "Hi {name}, welcome to the Power Plus family! Your membership is active. Start training today!" },
  { name: "Training tip", subject: "This week's tip", body: "Hi {name}, add 2 sets of deadlifts to your routine this week to progress faster!" },
  { name: "General announcement", subject: "Club announcement", body: "Hi {name}, {message}" },
];

/* ------------------------------------------------------------------ */
/* Phase 2 — Customer categories, access rules and aerobics groups     */
/* ------------------------------------------------------------------ */

/** Editable category labels (default value: REGULAR). */
export const CATEGORY_LABELS: CategoryLabel[] = [
  { category: "REGULAR", label: "Standard", description: "Full gym access during opening hours." },
  { category: "STUDENT", label: "Student", description: "Reduced rate with a valid student ID. Off-peak access (before 4:00 PM) + weekends." },
  { category: "MUSLIM", label: "Women's Hours (Muslim)", description: "Access reserved for the women's hours from 9:00 AM to 4:00 PM, main hall privatized." },
  { category: "AEROBICS", label: "Aerobics & Dance", description: "Access during aerobics and dance class slots (5:00 PM – 9:00 PM)." },
];

export const ALL_CATEGORIES: CustomerCategory[] = ["REGULAR", "STUDENT", "MUSLIM", "AEROBICS"];

export const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const ALL_DAYS = "All days";
export const ACCESS_DAYS = [ALL_DAYS, ...WEEK_DAYS];

/** Access rules per category — evaluated on every check-in. */
export const ACCESS_RULES: AccessRule[] = [
  { id: "ar1", category: "REGULAR", days: [ALL_DAYS], startTime: "05:00", endTime: "23:00", description: "Full access to all facilities.", active: true },
  { id: "ar2", category: "STUDENT", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], startTime: "05:00", endTime: "16:00", description: "Student rate — weekday off-peak access (before 4:00 PM).", active: true },
  { id: "ar3", category: "STUDENT", days: ["Saturday", "Sunday"], startTime: "05:00", endTime: "22:00", description: "Student rate — open access on weekends.", active: true },
  { id: "ar4", category: "MUSLIM", days: [ALL_DAYS], startTime: "09:00", endTime: "16:00", description: "Women's hours: main hall privatized from 9:00 AM to 4:00 PM.", active: true },
  { id: "ar5", category: "AEROBICS", days: [ALL_DAYS], startTime: "17:00", endTime: "21:00", description: "Access allowed during aerobics and dance classes (5:00 PM – 9:00 PM).", active: true },
];

/** Aerobics groups (link the AEROBICS category → classes & coach). */
export const AEROBICS_GROUPS: AerobicsGroup[] = [
  { id: "agp1", name: "Beginner Aerobics", days: ["Monday", "Wednesday", "Friday"], timeSlot: "18:00 – 19:00", trainerId: "t2", trainerName: "Bethlehem Tesfaye", capacity: 24, memberIds: ["m8"] },
  { id: "agp2", name: "Advanced Dance Fitness", days: ["Tuesday", "Thursday"], timeSlot: "19:00 – 20:30", trainerId: "t3", trainerName: "Dawit Kassa", capacity: 18, memberIds: ["m3"] },
  { id: "agp3", name: "Senior Aerobics", days: ["Saturday", "Sunday"], timeSlot: "09:00 - 10:00", trainerId: "t2", trainerName: "Bethlehem Tesfaye", capacity: 20, memberIds: [] },
];

/** Steam access (steam room / hammam) — packages & single sessions. */
export const STEAM_ACCESS: SteamAccess[] = [
  { id: "sa1", customerId: "m1", type: "package", startDate: "2026-01-05", endDate: "2030-12-31", remainingVisits: 8, status: "Active", paymentId: "pay_st1", createdAt: "2026-01-05T10:00:00.000Z", updatedAt: "2026-01-05T10:00:00.000Z" },
  { id: "sa2", customerId: "m2", type: "per_visit", startDate: "2026-02-01", endDate: "2030-12-31", remainingVisits: 2, status: "Active", paymentId: "pay_st2", createdAt: "2026-02-01T09:30:00.000Z", updatedAt: "2026-02-01T09:30:00.000Z" },
  { id: "sa3", customerId: "m3", type: "package", startDate: "2024-01-10", endDate: "2024-06-30", remainingVisits: 0, status: "Expired", paymentId: null, createdAt: "2024-01-10T08:00:00.000Z", updatedAt: "2024-06-30T08:00:00.000Z" },
];

/** Steam entry log (audit trail). */
export const STEAM_USAGE: SteamUsage[] = [
  { id: "su1", customerId: "m1", steamAccessId: "sa1", recordedBy: "Reception", timestamp: "2026-01-12T18:20:00.000Z", notes: "Post-workout session" },
  { id: "su2", customerId: "m1", steamAccessId: "sa1", recordedBy: "Selam (Reception)", timestamp: "2026-01-20T07:45:00.000Z", notes: "" },
  { id: "su3", customerId: "m2", steamAccessId: "sa2", recordedBy: "Reception", timestamp: "2026-02-05T19:10:00.000Z", notes: "Single-session access" },
];

/* ------------------------------------------------------------------ */
/* Phase 2 (Part 3) — Lockers                                          */
/* ------------------------------------------------------------------ */

/** Initial locker inventory (Men / Women / VIP sections). */
export const LOCKERS: Locker[] = [
  { id: "lk1", number: "M-01", section: "Men", keyTag: "K-101", status: "IN_USE", createdAt: "2026-01-02" },
  { id: "lk2", number: "M-02", section: "Men", keyTag: "K-102", status: "AVAILABLE", createdAt: "2026-01-02" },
  { id: "lk3", number: "M-03", section: "Men", keyTag: "K-103", status: "AVAILABLE", createdAt: "2026-01-02" },
  { id: "lk4", number: "M-04", section: "Men", keyTag: "K-104", status: "OUT_OF_SERVICE", notes: "Locks under repair", createdAt: "2026-01-02" },
  { id: "lk5", number: "W-01", section: "Women", keyTag: "K-201", status: "AVAILABLE", createdAt: "2026-01-02" },
  { id: "lk6", number: "W-02", section: "Women", keyTag: "K-202", status: "IN_USE", createdAt: "2026-01-02" },
  { id: "lk7", number: "W-03", section: "Women", keyTag: "K-203", status: "AVAILABLE", createdAt: "2026-01-02" },
  { id: "lk8", number: "V-01", section: "VIP", keyTag: "K-301", status: "AVAILABLE", createdAt: "2026-01-02" },
  { id: "lk9", number: "V-02", section: "VIP", keyTag: "K-302", status: "IN_USE", createdAt: "2026-01-02" },
  { id: "lk10", number: "G-01", section: "General", keyTag: "K-401", status: "AVAILABLE", createdAt: "2026-01-02" },
];

/** Locker assignments (only one active assignment per locker and per member). */
export const LOCKER_ASSIGNMENTS: LockerAssignment[] = [
  { id: "la1", lockerId: "lk1", memberId: "m1", memberName: "Abebe Kebede", assignedAt: "2026-01-05", dueDate: "2026-02-05", returnedAt: null, status: "active", keyReturned: false, lostKeyFee: 0, issuedBy: "Selam", notes: "" },
  { id: "la2", lockerId: "lk6", memberId: "m4", memberName: "Hana Girma", assignedAt: "2026-01-08", dueDate: null, returnedAt: null, status: "active", keyReturned: false, lostKeyFee: 0, issuedBy: "Selam", notes: "" },
  { id: "la3", lockerId: "lk9", memberId: "m5", memberName: "Yonas Bekele", assignedAt: "2026-01-10", dueDate: "2026-03-10", returnedAt: null, status: "active", keyReturned: false, lostKeyFee: 0, issuedBy: "Selam", notes: "VIP client" },
  { id: "la4", lockerId: "lk2", memberId: "m6", memberName: "Meron Fikru", assignedAt: "2025-12-01", dueDate: "2025-12-31", returnedAt: "2025-12-28", status: "returned", keyReturned: true, lostKeyFee: 0, issuedBy: "Selam", notes: "" },
  { id: "la5", lockerId: "lk4", memberId: "m7", memberName: "Solomon Haile", assignedAt: "2025-11-10", dueDate: "2025-12-10", returnedAt: null, status: "lost", keyReturned: false, lostKeyFee: 200, issuedBy: "Selam", notes: "Key not returned" },
];