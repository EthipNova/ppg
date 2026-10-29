export type Role = "owner" | "staff" | "member" | "trainer";

export type MemberStatus = "active" | "expiring" | "expired" | "inactive" | "blocked";

export interface Member {
  id: string;
  name: string;
  phone: string;
  email: string;
  memberId: string;
  planId: string;
  joinDate: string;
  expiryDate: string;
  status: MemberStatus;
  lastVisit: string | null;
  emergencyContact: string;
  emergencyPhone: string;
  medicalNotes: string;
  emailNotifications: boolean;
  balanceDue: number;
  category: CustomerCategory;
  studentId?: string;
  institution?: string;
  studentVerified?: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  aerobicsGroupId?: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  perks: string[];
  active: boolean;
  applicableCategories: CustomerCategory[] | "ALL";
  description?: string;
}

export interface Payment {
  id: string;
  memberId: string;
  amount: number;
  date: string;
  method: "telebirr" | "cbe_birr" | "cash" | "card";
  type: "membership" | "renewal" | "adjustment" | "steam";
  note: string;
}

export interface Expense {
  id: string;
  category: "rent" | "utilities" | "equipment" | "salaries" | "maintenance" | "other";
  amount: number;
  date: string;
  description: string;
}

export interface Visit {
  id: string;
  memberId: string;
  timestamp: string;
  checkedInBy: string;
  category: CustomerCategory;
  accessStatus: AccessStatus;
  overrideReason?: string;
}

export interface EmailLog {
  id: string;
  to: string;
  toName: string;
  subject: string;
  body: string;
  type: "welcome" | "receipt" | "reminder" | "expired" | "renewal" | "inactivity" | "password_reset" | "manual" | "contact";
  sentAt: string;
  status: "sent" | "delivered" | "opened" | "failed";
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface GymSettings {
  gymName: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  inactivityThresholdDays: number;
  currency: string;
  /* Steam (Hammam) add-on configuration */
  steamEnabled: boolean;
  steamModel: SteamModel;
  steamPackagePrice: number;
  steamPackageDays: number;
  steamPackageVisits: number;
  steamPerVisitPrice: number;
  steamExpiringSoonDays: number;
}

export interface AuditLog {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  details: string;
}

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  memberId?: string;
  trainerId?: string;
  category?: CustomerCategory;
  customerCode?: string;
  status?: string;
}

export interface Trainer {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialties: string[];
  bio?: string;
  active: boolean;
  clientIds: string[];
  weeklyHours: number;
}

export type ClassCategory = "HIIT" | "Strength" | "Yoga" | "Cardio" | "Boxing" | "Spin";

export interface GymClass {
  id: string;
  title: string;
  description: string;
  trainerId: string;
  trainerName: string;
  dayOfWeek: string;
  time: string;
  room: string;
  capacity: number;
  category: ClassCategory;
}

export interface ClassAttendee {
  id: string;
  classId: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  attended: boolean;
  date: string;
}

export interface TrainerClientNote {
  id: string;
  trainerId: string;
  memberId: string;
  date: string;
  workoutFocus: string;
  notes: string;
}

/* ------------------------------------------------------------------ */
/* Phase 2 — Gestion des catégories clients et règles d'accès          */
/* ------------------------------------------------------------------ */

export type CustomerCategory = "STUDENT" | "MUSLIM" | "AEROBICS" | "REGULAR" | (string & {});

export type AccessStatus = "allowed" | "denied" | "override";

/** Libellé et description éditables par le gérant pour chaque catégorie. */
export interface CategoryLabel {
  category: CustomerCategory;
  label: string;
  description: string;
  isSystem?: boolean;
}

/** Règle d'accès associée à une catégorie (jours + plage horaire). */
export interface AccessRule {
  id: string;
  category: CustomerCategory;
  days: string[];
  startTime: string;
  endTime: string;
  description: string;
  active: boolean;
}

/** Groupe de cours d'aérobic rattaché à la catégorie AEROBICS. */
export interface AerobicsGroup {
  id: string;
  name: string;
  days: string[];
  timeSlot: string;
  trainerId: string;
  trainerName: string;
  capacity: number;
  memberIds: string[];
}

/** Résultat de l'évaluation d'accès au moment d'un pointage. */
export interface AccessDecision {
  allowed: boolean;
  status: AccessStatus;
  message: string;
}

/* ------------------------------------------------------------------ */
/* Phase 3 — Add-on Steam (Bain de vapeur / Hammam)                    */
/* ------------------------------------------------------------------ */

/** Modèle d'accès Steam configuré par le gérant. */
export type SteamModel = "package" | "per_visit" | "both";

/** Type d'accès Steam acheté par un client. */
export type SteamType = "package" | "per_visit";

/** Statut calculé d'un accès Steam. */
export type SteamStatus = "Active" | "Expiring Soon" | "Expired" | "Cancelled";

/** Accès Steam (forfait ou séance à l'unité) rattaché à un client. */
export interface SteamAccess {
  id: string;
  customerId: string;
  type: SteamType;
  startDate: string;
  endDate: string;
  remainingVisits: number;
  status: SteamStatus;
  paymentId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Enregistrement d'une entrée Steam (traçabilité complète). */
export interface SteamUsage {
  id: string;
  customerId: string;
  steamAccessId: string;
  recordedBy: string;
  timestamp: string;
  notes: string;
}

/* ------------------------------------------------------------------ */
/* Phase 2 (Part 3) — Casiers / Lockers & support bilingue EN / AM      */
/* ------------------------------------------------------------------ */

/** Langues prises en charge par l'interface. */
export type Language = "en" | "am";

/** Statut opérationnel d'un casier. */
export type LockerStatus = "AVAILABLE" | "IN_USE" | "OUT_OF_SERVICE";

/** Zone physique du casier. */
export type LockerSection = "Men" | "Women" | "VIP" | "General";

/** Statut d'une attribution de casier. */
export type LockerAssignmentStatus = "active" | "returned" | "lost";

/** Casier de la salle (section, numéro et porte-clés). */
export interface Locker {
  id: string;
  number: string;
  section: LockerSection;
  keyTag: string;
  status: LockerStatus;
  notes?: string;
  createdAt: string;
  isActive?: boolean;
}

/** Attribution d'un casier à un client (trace complète). */
export interface LockerAssignment {
  id: string;
  lockerId: string;
  memberId: string;
  memberName: string;
  assignedAt: string;
  dueDate: string | null;
  returnedAt: string | null;
  status: LockerAssignmentStatus;
  keyReturned: boolean;
  lostKeyFee: number;
  issuedBy: string;
  notes: string;
  keyNumber?: string;
  returnedBy?: string;
}
