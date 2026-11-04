import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, Lightning, User, ShieldCheck, CreditCard, Calendar, Flame, MoonStars, Lockers, ArrowClockwise, XCircle } from "@phosphor-icons/react";
import { useGym, useT, formatETB, categoryLabelOf } from "../context/GymContext";
import CustomerProfileView from "./CustomerProfileView";
import CustomerSteamHistory from "./CustomerSteamHistory";
import CustomerMotivationalHero from "./CustomerMotivationalHero";
import MotivationalWatermark from "./MotivationalWatermark";
import CustomerMyTrainer from "./CustomerMyTrainer";
import type { CustomerCategory, Member, MemberStatus, Payment } from "../types";
import { fetchAerobicsDashboardData, type AerobicsDashboardState } from "../services/aerobicsDashboardService";
import { fetchRegularDashboardData, type RegularDashboardState } from "../services/regularDashboardService";
import { fetchStudentDashboardData, type StudentDashboardState } from "../services/studentDashboardService";
import { fetchCustomerActiveLocker, type CustomerLockerInfo } from "../services/lockers";
import { fetchCustomerActiveTrainer, type CustomerActiveTrainerInfo } from "../services/personalTrainerService";
import { DEMO_CREDENTIALS } from "../constants";

const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-6";

function normalizeMemberStatus(value: string): MemberStatus {
  switch (value.toLowerCase()) {
    case "active": return "active";
    case "expiring": return "expiring";
    case "expired": return "expired";
    case "inactive": return "inactive";
    case "blocked": return "blocked";
    default: return "inactive";
  }
}

function normalizePaymentMethod(value: string): Payment["method"] {
  switch (value.toLowerCase()) {
    case "telebirr": return "telebirr";
    case "cbe_birr": return "cbe_birr";
    case "card": return "card";
    default: return "cash";
  }
}

function normalizePaymentType(value: string): Payment["type"] {
  switch (value.toLowerCase()) {
    case "renewal": return "renewal";
    case "adjustment": return "adjustment";
    case "steam": return "steam";
    default: return "membership";
  }
}

/**
 * TEMPORARY development bridge: maps the legacy demo regular member "m1"
 * to canonical live Regular customer PP-004 UUID (Hana Girma).
 * Isolated and easy to remove once auth-based identity resolution is in place.
 */
const REGULAR_DEMO_UUID = "11111111-1111-1111-1111-111111111104";

type MemberTab = "dashboard" | "my-trainer" | "steam" | "profile";

const TAB_TO_SLUG: Record<MemberTab, string> = {
  dashboard: "dashboard",
  "my-trainer": "my-trainer",
  steam: "steam",
  profile: "profile",
};

const SLUG_TO_TAB: Record<string, MemberTab> = {
  dashboard: "dashboard",
  "my-trainer": "my-trainer",
  trainer: "my-trainer",
  steam: "steam",
  profile: "profile",
};

export default function MemberPortal() {
  const { state, dispatch } = useGym();
  const t = useT();
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const tab: MemberTab = (section && SLUG_TO_TAB[section.toLowerCase()]) || "dashboard";

  const handleTabChange = (nextTab: MemberTab) => {
    navigate(`/customer/${TAB_TO_SLUG[nextTab]}`);
  };

  // Active Personal Trainer State (Conditional Navigation)
  const [activeTrainer, setActiveTrainer] = useState<CustomerActiveTrainerInfo | null>(null);

  // Real Active Locker Assignment from Supabase
  const [customerLocker, setCustomerLocker] = useState<CustomerLockerInfo | null>(null);

  // Determine customer category session
  const currentMemberId = state.currentUser?.memberId || "";
  const isAerobicsUser =
    state.currentUser?.category === "AEROBICS" ||
    currentMemberId === DEMO_CREDENTIALS.member_aerobics.id ||
    currentMemberId === "m8" ||
    state.members.find(m => m.id === currentMemberId)?.category === "AEROBICS";

  const isRegularUser =
    !isAerobicsUser &&
    (state.currentUser?.category === "REGULAR" ||
      currentMemberId === "m1" ||
      currentMemberId === REGULAR_DEMO_UUID ||
      state.members.find(m => m.id === currentMemberId)?.category === "REGULAR");
  const isStudentUser = !isAerobicsUser && !isRegularUser && state.currentUser?.category === "STUDENT";

  const isMuslimUser =
    !isAerobicsUser &&
    !isRegularUser &&
    (state.currentUser?.category === "MUSLIM" ||
      currentMemberId === "11111111-1111-1111-1111-111111111107" ||
      currentMemberId === "m7" ||
      state.members.find(m => m.id === currentMemberId)?.category === "MUSLIM");

  // Async state for Aerobics live Supabase integration
  const [aerobicsState, setAerobicsState] = useState<AerobicsDashboardState>({ status: "loading" });
  // Async state for Regular live Supabase integration
  const [regularState, setRegularState] = useState<RegularDashboardState>({ status: "loading" });
  // Async state for Muslim live Supabase integration
  const [muslimState, setMuslimState] = useState<RegularDashboardState>({ status: "loading" });
  const [studentState, setStudentState] = useState<StudentDashboardState>({ status: "loading" });
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Target Customer UUID for database queries
  const targetCustomerUuid =
    currentMemberId === "m1"
      ? REGULAR_DEMO_UUID
      : currentMemberId === "m8"
      ? DEMO_CREDENTIALS.member_aerobics.id
      : currentMemberId === "m7"
      ? "11111111-1111-1111-1111-111111111107"
      : state.currentUser?.memberId || state.currentUser?.id || currentMemberId;

  // Check active personal trainer assignment from Supabase
  useEffect(() => {
    let isMounted = true;
    if (!targetCustomerUuid) {
      setActiveTrainer(null);
      return;
    }

    fetchCustomerActiveTrainer(targetCustomerUuid)
      .then((trainer) => {
        if (isMounted) {
          setActiveTrainer(trainer);
          if (!trainer) {
            handleTabChange("dashboard");
          }
        }
      })
      .catch((err) => {
        console.error("fetchCustomerActiveTrainer error:", err);
        if (isMounted) setActiveTrainer(null);
      });

    return () => {
      isMounted = false;
    };
  }, [targetCustomerUuid, fetchTrigger]);

  // Query authenticated customer's real locker assignment from Supabase
  useEffect(() => {
    let isMounted = true;
    if (!targetCustomerUuid) {
      setCustomerLocker(null);
      return;
    }

    fetchCustomerActiveLocker(targetCustomerUuid)
      .then((locker) => {
        if (isMounted) setCustomerLocker(locker);
      })
      .catch((err) => {
        console.error("fetchCustomerActiveLocker error:", err);
        if (isMounted) setCustomerLocker(null);
      });

    return () => {
      isMounted = false;
    };
  }, [targetCustomerUuid, fetchTrigger]);


  useEffect(() => {
    if (!isAerobicsUser) return;
    let isMounted = true;
    setAerobicsState({ status: "loading" });

    // Target the live customer UUID for Aerobics
    const targetUuid = currentMemberId === "m8"
      ? DEMO_CREDENTIALS.member_aerobics.id
      : currentMemberId;

    fetchAerobicsDashboardData(targetUuid)
      .then(res => {
        if (isMounted) setAerobicsState(res);
      })
      .catch(() => {
        if (isMounted) setAerobicsState({ status: "error", error: "Failed to connect to database" });
      });

    return () => { isMounted = false; };
  }, [isAerobicsUser, currentMemberId, fetchTrigger]);

  useEffect(() => {
    if (!isRegularUser) return;
    let isMounted = true;
    setRegularState({ status: "loading" });

    // Target the live customer UUID for Regular customer via isolated bridge if legacy 'm1'
    const targetUuid = currentMemberId === "m1"
      ? REGULAR_DEMO_UUID
      : currentMemberId;

    fetchRegularDashboardData(targetUuid)
      .then(res => {
        if (isMounted) setRegularState(res);
      })
      .catch(() => {
        if (isMounted) setRegularState({ status: "error", error: "Failed to connect to database" });
      });

    return () => { isMounted = false; };
  }, [isRegularUser, currentMemberId, fetchTrigger]);

  useEffect(() => {
    if (!isStudentUser) return;
    let isMounted = true;
    setStudentState({ status: "loading" });
    fetchStudentDashboardData().then(result => {
      if (isMounted) setStudentState(result);
    }).catch((error: unknown) => {
      console.error("[StudentDashboard] Unexpected dashboard load failure", {
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : "unknown",
      });
      if (isMounted) setStudentState({
        status: "error",
        error: error instanceof TypeError
          ? "The database could not be reached. Check your connection and retry."
          : "Student dashboard data could not be loaded. Retry in a moment.",
      });
    });
    return () => { isMounted = false; };
  }, [isStudentUser, state.currentUser?.id, state.currentUser?.role, state.currentUser?.category, fetchTrigger]);

  // Synchronize currentUser.name in global state with live Supabase name for Aerobics customers
  useEffect(() => {
    if (isAerobicsUser && aerobicsState.status === "success" && state.currentUser) {
      const liveName = aerobicsState.data.customer.fullName;
      if (liveName && state.currentUser.name !== liveName) {
        dispatch({
          type: "SET_USER",
          payload: {
            ...state.currentUser,
            name: liveName,
          },
        });
      }
    }
  }, [isAerobicsUser, aerobicsState, state.currentUser, dispatch]);

  // Synchronize currentUser.name in global state with live Supabase name for Regular customers
  useEffect(() => {
    if (isRegularUser && regularState.status === "success" && state.currentUser) {
      const liveName = regularState.data.customer.fullName;
      if (liveName && state.currentUser.name !== liveName) {
        dispatch({
          type: "SET_USER",
          payload: {
            ...state.currentUser,
            name: liveName,
          },
        });
      }
    }
  }, [isRegularUser, regularState, state.currentUser, dispatch]);

  useEffect(() => {
    if (!isMuslimUser) return;
    let isMounted = true;
    setMuslimState({ status: "loading" });

    // Target the live customer UUID for Muslim customer
    const targetUuid = currentMemberId === "m7"
      ? "11111111-1111-1111-1111-111111111107"
      : currentMemberId;

    fetchRegularDashboardData(targetUuid)
      .then(res => {
        if (isMounted) setMuslimState(res);
      })
      .catch(() => {
        if (isMounted) setMuslimState({ status: "error", error: "Failed to connect to database" });
      });

    return () => { isMounted = false; };
  }, [isMuslimUser, currentMemberId, fetchTrigger]);

  // Synchronize currentUser.name in global state with live Supabase name for Muslim customers
  useEffect(() => {
    if (isMuslimUser && muslimState.status === "success" && state.currentUser) {
      const liveName = muslimState.data.customer.fullName;
      if (liveName && state.currentUser.name !== liveName) {
        dispatch({
          type: "SET_USER",
          payload: {
            ...state.currentUser,
            name: liveName,
          },
        });
      }
    }
  }, [isMuslimUser, muslimState, state.currentUser, dispatch]);

  // Non-live categories: existing in-memory lookup
  const fallbackMember = state.members.find(
    m => m.id === currentMemberId || m.memberId === currentMemberId || (state.currentUser?.customerCode && m.memberId === state.currentUser.customerCode)
  );

  // If Aerobics user, handle async state gates
  if (isAerobicsUser) {
    if (aerobicsState.status === "loading") {
      return (
        <div className="min-h-[100dvh] bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
          <div className="w-10 h-10 border-4 border-lime-400/20 border-t-lime-400 rounded-full animate-spin mb-4" />
          <h2 className="text-lg font-bold">Loading Aerobics Dashboard...</h2>
          <p className="text-xs text-zinc-500 mt-1">Retrieving live customer schedule and membership from Supabase</p>
        </div>
      );
    }

    if (aerobicsState.status === "error") {
      return (
        <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-red-500/30 rounded-2xl p-6 max-w-md text-center">
            <XCircle weight="fill" className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2 text-white">Unable to Load Aerobics Dashboard</h2>
            <p className="text-zinc-400 text-sm mb-5">{aerobicsState.error}</p>
            <button
              onClick={() => setFetchTrigger(prev => prev + 1)}
              className="bg-lime-400 text-zinc-950 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-lime-300 transition-colors inline-flex items-center gap-2"
            >
              <ArrowClockwise weight="bold" className="w-4 h-4" /> Try Again
            </button>
          </div>
        </div>
      );
    }

    if (aerobicsState.status === "not_found") {
      return (
        <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md text-center">
            <User className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2 text-white">{t("member.noProfile")}</h2>
            <p className="text-zinc-500 text-sm">{aerobicsState.message}</p>
          </div>
        </div>
      );
    }
  } else if (isRegularUser) {
    if (regularState.status === "loading") {
      return (
        <div className="min-h-[100dvh] bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
          <div className="w-10 h-10 border-4 border-lime-400/20 border-t-lime-400 rounded-full animate-spin mb-4" />
          <h2 className="text-lg font-bold">Loading Regular Dashboard...</h2>
          <p className="text-xs text-zinc-500 mt-1">Retrieving live customer membership and attendance from Supabase</p>
        </div>
      );
    }

    if (regularState.status === "error") {
      return (
        <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-red-500/30 rounded-2xl p-6 max-w-md text-center">
            <XCircle weight="fill" className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2 text-white">Unable to Load Regular Dashboard</h2>
            <p className="text-zinc-400 text-sm mb-5">{regularState.error}</p>
            <button
              onClick={() => setFetchTrigger(prev => prev + 1)}
              className="bg-lime-400 text-zinc-950 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-lime-300 transition-colors inline-flex items-center gap-2"
            >
              <ArrowClockwise weight="bold" className="w-4 h-4" /> Try Again
            </button>
          </div>
        </div>
      );
    }

    if (regularState.status === "not_found") {
      return (
        <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md text-center">
            <User className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2 text-white">{t("member.noProfile")}</h2>
            <p className="text-zinc-500 text-sm">{regularState.message}</p>
          </div>
        </div>
      );
    }
  } else if (isMuslimUser) {
    if (muslimState.status === "loading") {
      return (
        <div className="min-h-[100dvh] bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
          <div className="w-10 h-10 border-4 border-lime-400/20 border-t-lime-400 rounded-full animate-spin mb-4" />
          <h2 className="text-lg font-bold">Loading Muslim Member Dashboard...</h2>
          <p className="text-xs text-zinc-500 mt-1">Retrieving live customer membership and attendance from Supabase</p>
        </div>
      );
    }

    if (muslimState.status === "error") {
      return (
        <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-red-500/30 rounded-2xl p-6 max-w-md text-center">
            <XCircle weight="fill" className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2 text-white">Unable to Load Dashboard</h2>
            <p className="text-zinc-400 text-sm mb-5">{muslimState.error}</p>
            <button
              onClick={() => setFetchTrigger(prev => prev + 1)}
              className="bg-lime-400 text-zinc-950 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-lime-300 transition-colors inline-flex items-center gap-2"
            >
              <ArrowClockwise weight="bold" className="w-4 h-4" /> Try Again
            </button>
          </div>
        </div>
      );
    }

    if (muslimState.status === "not_found") {
      return (
        <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md text-center">
            <User className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2 text-white">{t("member.noProfile")}</h2>
            <p className="text-zinc-500 text-sm">{muslimState.message}</p>
          </div>
        </div>
      );
    }
  } else if (isStudentUser) {
    if (studentState.status === "loading") return <PortalState title="Loading Student Dashboard..." message="Retrieving your membership and attendance from Supabase." />;
    if (studentState.status === "error") return <PortalState title="Unable to Load Student Dashboard" message={studentState.error} retry={() => setFetchTrigger(value => value + 1)} />;
    if (studentState.status === "not_found") return <PortalState title={t("member.noProfile")} message={studentState.message} />;
  } else if (!fallbackMember && !state.currentUser) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <User className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">{t("member.noProfile")}</h2>
          <p className="text-zinc-500">{t("member.noProfileHint")}</p>
        </div>
      </div>
    );
  }

  // Map active member, plan, visits, etc.
  let member: Member;
  let category: CustomerCategory;
  let plan: typeof state.plans[0] | undefined;
  let daysRemaining: number;
  let totalDays: number;
  let progress: number;
  let visits: typeof state.visits;
  let expired: boolean;
  let countdownState: "active" | "expiring" | "expired";

  if (isStudentUser && studentState.status === "success") {
    const data = studentState.data;
    category = "STUDENT";
    member = {
      id: data.customer.id, name: data.customer.fullName, phone: data.customer.phone, email: data.customer.email || "",
      memberId: data.customer.customerCode, planId: data.membership?.planId || data.requestedPlan?.id || "",
      joinDate: data.membership?.startDate || data.customer.joinDate || "—", expiryDate: data.membership?.endDate || "—",
      status: (data.membership?.status || data.customer.status || "active").toLowerCase() as Member["status"],
      lastVisit: data.attendance.lastVisit, emergencyContact: "", emergencyPhone: "", medicalNotes: "",
      emailNotifications: true, balanceDue: data.balanceDue || 0, category: "STUDENT",
      studentId: data.customer.studentId, institution: data.customer.institution, studentVerified: true,
      gender: data.customer.gender,
      photoUrl: data.customer.photoUrl,
    };
    const studentPlan = data.membership ? { id: data.membership.planId, name: data.membership.planName, price: data.membership.priceAtPurchase,
      durationDays: data.membership.planDurationDays, perks: data.membership.planBenefits?.split(",").map(value => value.trim()).filter(Boolean) || [], active: true, applicableCategories: ["STUDENT"] as CustomerCategory[] }
      : data.requestedPlan ? { id: data.requestedPlan.id, name: data.requestedPlan.name, price: data.requestedPlan.price,
        durationDays: data.requestedPlan.durationDays, perks: data.requestedPlan.benefits?.split(",").map(value => value.trim()).filter(Boolean) || [], active: true, applicableCategories: ["STUDENT"] as CustomerCategory[] }
      : undefined;
    plan = studentPlan;
    daysRemaining = data.membership?.daysRemaining || 0; totalDays = data.membership?.planDurationDays || 30;
    progress = data.membership?.progressPercent || 0; expired = !data.membership || data.membership.isExpired;
    countdownState = !data.membership || expired ? "expired" : daysRemaining <= 7 ? "expiring" : "active";
    visits = data.attendance.recent.map(item => ({ id: item.id, memberId: data.customer.id, timestamp: item.checkedInAt, checkedInBy: item.checkInMethod, category: "STUDENT" as CustomerCategory, accessStatus: "allowed" as const }));
  } else if (isAerobicsUser && aerobicsState.status === "success") {
    const { customer, membership, session, trainer: liveTrainer, attendance } = aerobicsState.data;
    category = "AEROBICS";
    member = {
      id: customer.id,
      name: customer.fullName,
      phone: customer.phone,
      email: customer.email || "",
      memberId: customer.customerCode,
      planId: membership?.plan?.id || "",
      joinDate: membership?.startDate || "—",
      expiryDate: membership?.endDate || "—",
      status: membership ? normalizeMemberStatus(membership.status) : "expired",
      lastVisit: attendance[0]?.checkedInAt || null,
      emergencyContact: "",
      emergencyPhone: "",
      medicalNotes: "",
      emailNotifications: true,
      balanceDue: 0,
      category: "AEROBICS",
      aerobicsGroupId: customer.aerobicsGroupId || undefined,
      gender: customer.gender,
      photoUrl: customer.photoUrl,
    };

    plan = membership?.plan
      ? {
          id: membership.plan.id,
          name: membership.plan.name,
          price: membership.plan.price,
          durationDays: membership.plan.durationDays,
          perks: membership.plan.benefits ? membership.plan.benefits.split(",").map(b => b.trim()) : ["Aerobics Classes", "Dance Fitness"],
          active: true,
          applicableCategories: ["AEROBICS"],
        }
      : undefined;

    daysRemaining = membership ? membership.daysRemaining : 0;
    totalDays = plan?.durationDays || 30;
    progress = membership ? Math.max(0, Math.min(100, ((totalDays - daysRemaining) / totalDays) * 100)) : 0;
    expired = !membership || daysRemaining <= 0;
    countdownState = !membership ? "expired" : expired ? "expired" : daysRemaining <= 7 ? "expiring" : "active";

    visits = attendance.map(a => ({
      id: a.id,
      memberId: customer.id,
      timestamp: a.checkedInAt,
      checkedInBy: a.checkInMethod,
      category: "AEROBICS" as CustomerCategory,
      accessStatus: "allowed" as const,
    }));
  } else if (isRegularUser && regularState.status === "success") {
    const { customer, membership, plan: livePlan, attendance, membershipSummary } = regularState.data;
    category = "REGULAR";
    member = {
      id: customer.id,
      name: customer.fullName,
      phone: customer.phone,
      email: customer.email || "",
      memberId: customer.customerCode,
      planId: livePlan?.id || "",
      joinDate: membership?.startDate || customer.joinDate || "—",
      expiryDate: membership?.endDate || "—",
      status: normalizeMemberStatus(customer.status),
      lastVisit: attendance.lastVisit,
      emergencyContact: "",
      emergencyPhone: "",
      medicalNotes: "",
      emailNotifications: true,
      balanceDue: 0,
      category: "REGULAR",
      gender: customer.gender,
      photoUrl: customer.photoUrl,
    };

    plan = livePlan
      ? {
          id: livePlan.id,
          name: livePlan.name,
          price: livePlan.price,
          durationDays: livePlan.durationDays,
          perks: livePlan.benefits
            ? livePlan.benefits.split(",").map(b => b.trim())
            : ["Weight-room access", "Lockers & changing rooms", "Cardio machines"],
          active: livePlan.isActive,
          applicableCategories: ["REGULAR"],
        }
      : undefined;

    daysRemaining = membershipSummary.daysRemaining;
    totalDays = membershipSummary.durationDays || (livePlan?.durationDays || 30);
    progress = membershipSummary.progressPercent;
    expired = membershipSummary.isExpired;
    countdownState = !membership ? "expired" : expired ? "expired" : membershipSummary.isExpiring ? "expiring" : "active";

    visits = attendance.recent.map(a => ({
      id: a.id,
      memberId: customer.id,
      timestamp: a.checkedInAt,
      checkedInBy: a.checkInMethod,
      category: "REGULAR" as CustomerCategory,
      accessStatus: "allowed" as const,
    }));
  } else if (isMuslimUser && muslimState.status === "success") {
    const { customer, membership, plan: livePlan, attendance, membershipSummary } = muslimState.data;
    category = "MUSLIM";
    member = {
      id: customer.id,
      name: customer.fullName,
      phone: customer.phone,
      email: customer.email || "",
      memberId: customer.customerCode,
      planId: livePlan?.id || "",
      joinDate: customer.joinDate || "—",
      expiryDate: membership?.endDate || "—",
      status: normalizeMemberStatus(customer.status),
      lastVisit: attendance.lastVisit,
      emergencyContact: "",
      emergencyPhone: "",
      medicalNotes: "",
      emailNotifications: true,
      balanceDue: 0,
      category: "MUSLIM",
      gender: customer.gender,
      photoUrl: customer.photoUrl,
    };

    plan = livePlan
      ? {
          id: livePlan.id,
          name: livePlan.name,
          price: livePlan.price,
          durationDays: livePlan.durationDays,
          perks: livePlan.benefits
            ? livePlan.benefits.split(",").map(b => b.trim())
            : [livePlan.description || "Gym Access"],
          active: livePlan.isActive,
          applicableCategories: ["MUSLIM"],
        }
      : undefined;

    daysRemaining = membershipSummary.daysRemaining;
    totalDays = membershipSummary.durationDays || (livePlan?.durationDays || 30);
    progress = membershipSummary.progressPercent;
    expired = membershipSummary.isExpired;
    countdownState = !membership ? "expired" : expired ? "expired" : membershipSummary.isExpiring ? "expiring" : "active";

    visits = attendance.recent.map(a => ({
      id: a.id,
      memberId: customer.id,
      timestamp: a.checkedInAt,
      checkedInBy: a.checkInMethod,
      category: "MUSLIM" as CustomerCategory,
      accessStatus: "allowed" as const,
    }));
  } else {
    // Path for non-live / categorized members (Student, Muslim, etc.)
    const defaultMember: Member = {
      id: state.currentUser?.id || "unknown",
      name: state.currentUser?.name || "Member",
      phone: "",
      email: "",
      memberId: state.currentUser?.customerCode || state.currentUser?.memberId || "PP-MEMBER",
      planId: "p1",
      category: state.currentUser?.category || "REGULAR",
      joinDate: new Date().toISOString().slice(0, 10),
      expiryDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      status: "active",
      lastVisit: null,
      emergencyContact: "",
      emergencyPhone: "",
      medicalNotes: "",
      emailNotifications: true,
      balanceDue: 0,
      gender: state.currentUser?.gender,
      photoUrl: state.currentUser?.photoUrl,
    };
    member = fallbackMember || defaultMember;
    category = state.currentUser?.category || member.category || "REGULAR";
    plan = state.plans.find(p => p.id === member.planId);
    daysRemaining = Math.max(0, Math.ceil((new Date(member.expiryDate).getTime() - Date.now()) / 86400000));
    totalDays = plan?.durationDays || 30;
    progress = Math.max(0, Math.min(100, ((totalDays - daysRemaining) / totalDays) * 100));
    visits = state.visits.filter(v => v.memberId === member.id).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    expired = new Date(member.expiryDate).getTime() < Date.now();
    countdownState = expired ? "expired" : daysRemaining <= 7 ? "expiring" : "active";
  }

  const rules = isStudentUser && studentState.status === "success"
    ? studentState.data.accessRules.map(rule => ({ id: rule.id, category: "STUDENT" as CustomerCategory, days: rule.days, startTime: rule.startTime, endTime: rule.endTime, description: rule.description, active: true }))
    : state.accessRules.filter(r => r.category === category && r.active);
  const payments = (isRegularUser && regularState.status === "success")
    ? regularState.data.payments.map(p => ({
        id: p.id,
        memberId: member.id,
        amount: p.amount,
        date: p.paidAt ? p.paidAt.split("T")[0] : (p.createdAt ? p.createdAt.split("T")[0] : "—"),
        method: normalizePaymentMethod(p.paymentMethod),
        type: normalizePaymentType(p.serviceType),
        note: p.notes || "",
      }))
    : (isMuslimUser && muslimState.status === "success")
    ? muslimState.data.payments.map(p => ({
        id: p.id,
        memberId: member.id,
        amount: p.amount,
        date: p.paidAt ? p.paidAt.split("T")[0] : (p.createdAt ? p.createdAt.split("T")[0] : "—"),
        method: normalizePaymentMethod(p.paymentMethod),
        type: normalizePaymentType(p.serviceType),
        note: p.notes || "",
      }))
    : (isAerobicsUser && aerobicsState.status === "success")
    ? aerobicsState.data.payments.map(p => ({
        id: p.id,
        memberId: member.id,
        amount: p.amount,
        date: p.paidAt ? p.paidAt.split("T")[0] : (p.createdAt ? p.createdAt.split("T")[0] : "—"),
        method: normalizePaymentMethod(p.paymentMethod),
        type: normalizePaymentType(p.serviceType),
        note: p.notes || "",
      }))
    : isStudentUser && studentState.status === "success"
    ? studentState.data.payments.map(payment => {
        const normalizedMethod = payment.method.toLowerCase();
        const method = normalizedMethod === "telebirr" ? "telebirr" : normalizedMethod === "cbe_birr" ? "cbe_birr" : normalizedMethod === "card" ? "card" : "cash";
        return { id: payment.id, memberId: member.id, amount: payment.amount,
          date: (payment.paidAt || payment.createdAt).split("T")[0], method, type: "membership" as const, note: payment.status };
      })
    : state.payments.filter(p => p.memberId === member.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const steamLeft = state.steamAccess
    .filter(s => s.customerId === member.id && new Date(s.endDate).getTime() >= Date.now() && s.remainingVisits > 0)
    .reduce((sum, s) => sum + s.remainingVisits, 0);
  const locale = state.language === "am" ? "am-ET" : "en-US";

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white p-4 md:p-8 relative overflow-hidden">
      {/* Background Motivational Typography Watermarks per section */}
      {tab === "dashboard" && (
        <MotivationalWatermark
          phrases={[
            "YOU VS YOU.",
            "ONE MORE REP.",
            "BUILT NOT GIVEN.",
            "TRUST THE PROCESS.",
            "EVERY REP COUNTS.",
          ]}
        />
      )}
      {tab === "my-trainer" && (
        <MotivationalWatermark
          phrases={[
            "BUILT BY DISCIPLINE.",
            "TRAIN WITH PURPOSE.",
            "NO EXCUSES.",
            "ONE MORE REP.",
          ]}
        />
      )}
      {tab === "steam" && (
        <MotivationalWatermark
          phrases={[
            "RECOVER. REBUILD. REPEAT.",
            "DISCIPLINE NEVER STOPS.",
            "STAY STRONG.",
          ]}
        />
      )}
      {tab === "profile" && (
        <MotivationalWatermark
          phrases={[
            "YOUR JOURNEY.",
            "STAY DISCIPLINED.",
            "BUILT NOT GIVEN.",
          ]}
        />
      )}

      <div className="max-w-4xl mx-auto relative z-10">
        <div className="flex items-center gap-2 mb-8">
          <ShieldCheck weight="fill" className="w-6 h-6 text-lime-400" />
          <h1 className="text-2xl font-black uppercase tracking-tight">{t("member.title")}</h1>
        </div>
        {(() => {
          const eligibleForWomensHour = category === "MUSLIM";
          const hasActiveTrainer = Boolean(activeTrainer && activeTrainer.status === "ACTIVE");
          const tabs: ("dashboard" | "my-trainer" | "steam" | "profile")[] = [
            "dashboard",
            ...(hasActiveTrainer ? ["my-trainer" as const] : []),
            "steam",
            "profile",
          ];
          return (
            <>
              {/* Mobile Navigation Dropdown (<640px) */}
              <div className="block sm:hidden mb-6">
                <label htmlFor="member-portal-tab-select" className="sr-only">Select member section</label>
                <select
                  id="member-portal-tab-select"
                  value={tab}
                  onChange={(e) => handleTabChange(e.target.value as MemberTab)}
                  className="w-full min-h-[44px] bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-lime-400 transition-colors"
                >
                  {tabs.map((key) => (
                    <option key={key} value={key}>
                      {key === "profile" && eligibleForWomensHour
                        ? "Profile & Women's Hours"
                        : t(`member.tab.${key}`)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Desktop Navigation Tabs (>=640px) */}
              <div className="hidden sm:flex gap-2 mb-8 overflow-x-auto pb-1">
                {tabs.map(key => (
                  <button
                    key={key}
                    onClick={() => handleTabChange(key)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors min-h-[44px] flex items-center ${
                      tab === key ? "bg-lime-400 text-zinc-950 font-bold" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {key === "profile" && eligibleForWomensHour
                      ? "Profile & Women's Hours"
                      : t(`member.tab.${key}`)}
                  </button>
                ))}
              </div>
            </>
          );
        })()}

        {tab === "dashboard" && (
          <div className="space-y-6">
            <CustomerMotivationalHero
              member={member}
              daysRemaining={daysRemaining}
              countdownState={countdownState}
              progress={progress}
              planName={plan?.name}
              planPrice={plan?.price}
              steamLeft={steamLeft}
              categoryLabel={categoryLabelOf(state, category)}
              lockerNumber={customerLocker?.lockerNumber}
              isStudent={isStudentUser}
              isMuslim={isMuslimUser}
              hasActiveMembership={Boolean(
                !(isStudentUser && studentState.status === "success" && !studentState.data.membership) &&
                (plan || (member.expiryDate && member.expiryDate !== "—"))
              )}
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: t("member.lastVisit"),
                  value: member.lastVisit ? new Date(member.lastVisit).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
                  sub: member.lastVisit ? new Date(member.lastVisit).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : undefined,
                  icon: Calendar,
                },
                {
                  label: t("member.totalVisits"),
                  value: isStudentUser && studentState.status === "success"
                    ? String(studentState.data.attendance.total)
                    : (isRegularUser && regularState.status === "success")
                    ? String(regularState.data.attendance.total)
                    : (isMuslimUser && muslimState.status === "success")
                    ? String(muslimState.data.attendance.total)
                    : (isAerobicsUser && aerobicsState.status === "success")
                    ? String(aerobicsState.data.attendanceTotal)
                    : String(visits.length),
                  icon: Flame,
                },
                {
                  label: t("member.payments"),
                  value: String(payments.length),
                  icon: CreditCard,
                },
                {
                  label: isRegularUser || isMuslimUser || isStudentUser ? "Balance Due" : t("member.balanceDue"),
                  value: isMuslimUser
                    ? "Not available"
                    : isStudentUser && studentState.status === "success"
                    ? studentState.data.balanceDue === null
                      ? "—"
                      : formatETB(studentState.data.balanceDue ?? 0)
                    : isRegularUser && regularState.status === "success"
                    ? "—"
                    : formatETB(member.balanceDue),
                  icon: Lightning,
                },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
                  <s.icon weight="fill" className="w-6 h-6 text-lime-400 mx-auto mb-2" />
                  <div className="text-lg font-black">{s.value}</div>
                  {s.sub && <div className="text-[11px] text-zinc-400 font-mono mt-0.5">{s.sub}</div>}
                  <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
                </motion.div>
              ))}
            </div>

            {/* Access Schedule Section on Customer Dashboard */}
            {(category === "MUSLIM" || rules.length > 0) && (
              <div className={CARD}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center text-lime-400 shrink-0">
                      <Clock weight="fill" className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-white">
                        {category === "MUSLIM" ? "Women's Hours Access Schedule" : "Permitted Access Schedule"}
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Designated days and permitted workout time windows
                      </p>
                    </div>
                  </div>
                  {category === "MUSLIM" && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-lime-400/15 text-lime-400 border border-lime-400/30">
                      <MoonStars weight="fill" className="w-3.5 h-3.5" />
                      Women's Access
                    </span>
                  )}
                </div>

                {rules.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-2">
                    No specific access restrictions configured. You have general gym floor access during standard opening hours.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 pt-1">
                    {rules.map(rule => (
                      <div
                        key={rule.id}
                        className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-3.5 text-xs flex flex-col justify-between gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-white text-sm">
                            {rule.days.join(", ")}
                          </span>
                          <span className="text-lime-400 font-mono font-bold bg-lime-400/10 border border-lime-400/20 px-2 py-0.5 rounded text-[11px] whitespace-nowrap">
                            {rule.startTime} – {rule.endTime}
                          </span>
                        </div>
                        {rule.description && (
                          <p className="text-zinc-400 text-xs leading-relaxed">
                            {rule.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={CARD}>
              <h3 className="font-bold mb-3 flex items-center gap-2"><Lockers weight="fill" className="w-5 h-5 text-amber-400" /> {t("member.myLocker")}</h3>
              {customerLocker ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div className="bg-zinc-800/50 rounded-xl p-3">
                    <div className="text-xs text-zinc-500">{t("locker.number")}</div>
                    <div className="font-black text-white text-lg">{customerLocker.lockerNumber}</div>
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-3">
                    <div className="text-xs text-zinc-500">{t("locker.section")}</div>
                    <div className="font-semibold text-white">{customerLocker.location || "General"}</div>
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-3">
                    <div className="text-xs text-zinc-500">{t("locker.keyTag")}</div>
                    <div className="font-semibold text-white">{customerLocker.keyNumber || "—"}</div>
                  </div>
                  {customerLocker.assignedAt && (
                    <div className="bg-zinc-800/50 rounded-xl p-3">
                      <div className="text-xs text-zinc-500">{t("locker.issuedAt")}</div>
                      <div className="font-semibold text-white">
                        {new Date(customerLocker.assignedAt).toLocaleDateString(locale)}
                      </div>
                    </div>
                  )}
                  {customerLocker.dueDate && (
                    <div className="bg-zinc-800/50 rounded-xl p-3">
                      <div className="text-xs text-zinc-500">{t("locker.dueDate")}</div>
                      <div className="font-semibold text-white">
                        {new Date(customerLocker.dueDate).toLocaleDateString(locale)}
                      </div>
                    </div>
                  )}
                  <div className="bg-zinc-800/50 rounded-xl p-3">
                    <div className="text-xs text-zinc-500">{t("locker.status")}</div>
                    <div className="font-semibold text-amber-400 capitalize">
                      {customerLocker.status === "ACTIVE" || customerLocker.status === "active" ? t("locker.status.IN_USE") : customerLocker.status}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-400">
                  No locker has been assigned to your account yet. Please contact Reception.
                </p>
              )}
            </div>
          </div>
        )}

        {tab === "my-trainer" && activeTrainer && (
          <CustomerMyTrainer
            customerId={member.id}
            initialTrainer={activeTrainer}
            onTrainerStatusChange={(hasTrainer) => {
              if (!hasTrainer) {
                setActiveTrainer(null);
                handleTabChange("dashboard");
              }
            }}
          />
        )}
        {tab === "steam" && (
          <CustomerSteamHistory customerId={member.id} />
        )}
        {tab === "profile" && (
          <CustomerProfileView
            customerId={member.id}
            onProfileUpdated={() => setFetchTrigger(prev => prev + 1)}
            isMuslimCategory={category === "MUSLIM"}
            womensHourRules={rules}
            womensHourTrainers={state.trainers.filter(trainer => trainer.active)}
          />
        )}
      </div>
    </div>
  );
}

function PortalState({ title, message, retry }: { title: string; message: string; retry?: () => void }) {
  return <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center p-4"><div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md text-center">
    <User className="w-12 h-12 text-zinc-500 mx-auto mb-3" /><h2 className="text-xl font-bold mb-2">{title}</h2><p className="text-zinc-400 text-sm">{message}</p>
    {retry && <button onClick={retry} className="mt-5 bg-lime-400 text-zinc-950 px-5 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-2"><ArrowClockwise weight="bold" className="w-4 h-4" />Try Again</button>}
  </div></div>;
}
