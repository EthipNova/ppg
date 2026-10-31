import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Sparkle,
  Clock,
  CalendarDots,
  CheckCircle,
  Warning,
  XCircle,
  Barbell,
  Lightning,
  Flame,
  Lockers,
  Info,
  ShieldCheck,
} from "@phosphor-icons/react";
import {
  useGym,
  computeMemberStatus,
  evaluateAccess,
  dayName,
  toMinutes,
  categoryLabelOf,
} from "../context/GymContext";
import { ALL_DAYS } from "../constants";
import type { Member } from "../types";

const WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const DAY_ABBR: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

import type {
  RegularMembershipSummary,
  RegularAttendanceSummary,
  RegularPaymentRecord,
} from "../services/regularDashboardService";

interface RegularCustomerDashboardProps {
  member: Member;
  membershipSummary?: RegularMembershipSummary;
  attendance?: RegularAttendanceSummary;
  payments?: RegularPaymentRecord[];
  onRenew?: () => void;
}

const FACILITIES = [
  {
    title: "Free Weights Zone",
    subtitle: "Heavy Lifting & Strength",
    icon: Barbell,
    items: [
      "Olympic barbells & competition plates",
      "Dumbbell pairs ranging from 2kg to 50kg",
      "Power racks, squat stands & safety pins",
      "Adjustable incline, flat & decline benches",
    ],
    highlight: "Unrestricted open floor",
  },
  {
    title: "Resistance & Cable Floor",
    subtitle: "Targeted Hypertrophy & Machines",
    icon: Lightning,
    items: [
      "Plate-loaded iso-lateral chest & leg presses",
      "Pin-selected weight stacks for full body",
      "Dual adjustable cable pulley crossovers",
      "Lat pulldown, seated rows & cable towers",
    ],
    highlight: "All machine stations included",
  },
  {
    title: "Cardio Suite",
    subtitle: "Conditioning & Endurance",
    icon: Flame,
    items: [
      "Commercial high-speed running treadmills",
      "Stair climbers with continuous revolving steps",
      "Concept2 air rowing machines & assault bikes",
      "Low-impact recumbent & upright exercise bikes",
    ],
    highlight: "Full cardio access",
  },
  {
    title: "Locker & Recovery Facilities",
    subtitle: "Amenities & Comfort",
    icon: Lockers,
    items: [
      "Spacious air-conditioned locker rooms",
      "High-pressure hot showers & private stalls",
      "Day-use lockers with secure key tags",
      "Cold filtered water refill stations",
    ],
    highlight: "Included with membership",
  },
];

export default function RegularCustomerDashboard({
  member,
  membershipSummary,
}: RegularCustomerDashboardProps) {
  const { state } = useGym();

  const now = useMemo(() => new Date(), []);
  const hasNoMembership = membershipSummary
    ? membershipSummary.status === "none"
    : !member.planId;
  const isExpired = membershipSummary
    ? membershipSummary.isExpired
    : computeMemberStatus(member, state.settings) === "expired";
  const isExpiring = membershipSummary
    ? membershipSummary.isExpiring
    : computeMemberStatus(member, state.settings) === "expiring";

  // Authoritative live access calculation using existing evaluateAccess()
  const accessDecision = evaluateAccess(
    member,
    state.accessRules,
    state.aerobicsGroups,
    now
  );

  // Active rules for REGULAR category (dynamic, not hardcoded)
  const regularRules = useMemo(
    () => state.accessRules.filter(r => r.active && r.category === "REGULAR"),
    [state.accessRules]
  );

  const currentDayName = dayName(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Rules matching today
  const todayRules = useMemo(
    () =>
      regularRules
        .filter(r => r.days.includes(ALL_DAYS) || r.days.includes(currentDayName))
        .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)),
    [regularRules, currentDayName]
  );

  // Calculate next opening information when currently outside hours
  const nextOpeningText = useMemo(() => {
    if (accessDecision.allowed) return null;

    // Check if there is an upcoming window later today
    const laterToday = todayRules.find(r => toMinutes(r.startTime) > currentMinutes);
    if (laterToday) {
      return `Today at ${laterToday.startTime}`;
    }

    // Look forward up to 7 days
    for (let i = 1; i <= 7; i++) {
      const futureDate = new Date(now.getTime() + i * 86400000);
      const futureDay = dayName(futureDate);
      const dayMatches = regularRules
        .filter(r => r.days.includes(ALL_DAYS) || r.days.includes(futureDay))
        .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

      if (dayMatches.length > 0) {
        const dayLabel = i === 1 ? "Tomorrow" : futureDay;
        return `${dayLabel} at ${dayMatches[0].startTime}`;
      }
    }

    return null;
  }, [accessDecision.allowed, todayRules, currentMinutes, regularRules, now]);

  // Days until expiry
  const daysRemaining = membershipSummary
    ? membershipSummary.daysRemaining
    : Math.max(
        0,
        Math.ceil((new Date(member.expiryDate).getTime() - now.getTime()) / 86400000)
      );

  // Weekly schedule mapping every day to all active applicable rule windows
  const weeklySchedule = useMemo(() => {
    return WEEK_DAYS.map(day => {
      const isToday = day === currentDayName;
      if (regularRules.length === 0) {
        return {
          day,
          isToday,
          windows: ["Open Access"],
          subtitle: "No time restriction",
          isOpen: true,
        };
      }

      const dayRules = regularRules
        .filter(r => r.days.includes(ALL_DAYS) || r.days.includes(day))
        .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

      if (dayRules.length === 0) {
        return {
          day,
          isToday,
          windows: ["Closed"],
          subtitle: "No access scheduled",
          isOpen: false,
        };
      }

      return {
        day,
        isToday,
        windows: dayRules.map(r => `${r.startTime} – ${r.endTime}`),
        subtitle: dayRules.length > 1 ? `${dayRules.length} session windows` : "Standard hours",
        isOpen: true,
      };
    });
  }, [regularRules, currentDayName]);

  const ruleDescription =
    todayRules[0]?.description ||
    regularRules[0]?.description ||
    accessDecision.message ||
    "Full gym access during open hours.";

  return (
    <div className="space-y-6">
      {/* 1. LIVE GYM ACCESS STATUS */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-8 pointer-events-none opacity-5">
          <Sparkle className="w-36 h-36 text-lime-400" />
        </div>

        {/* Case A: No Membership or Membership Expired */}
        {hasNoMembership ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-zinc-800 text-zinc-300 border border-zinc-700 mb-2">
                <Info weight="fill" className="w-3.5 h-3.5" />
                NO ACTIVE MEMBERSHIP
              </div>
              <h3 className="text-xl font-black text-white">No Active Membership</h3>
              <p className="text-zinc-400 text-sm mt-1 max-w-xl">
                You do not currently have an active regular gym membership. Please visit Reception to choose a plan and activate your membership.
              </p>
            </div>
            <div className="bg-zinc-800/80 border border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-zinc-300 font-semibold self-start sm:self-center">
              Visit Reception to activate
            </div>
          </div>
        ) : isExpired ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-red-400/20 text-red-400 border border-red-400/30 mb-2">
                <XCircle weight="fill" className="w-3.5 h-3.5" />
                MEMBERSHIP EXPIRED
              </div>
              <h3 className="text-xl font-black text-white">Membership Expired</h3>
              <p className="text-red-200/90 text-sm mt-1 max-w-xl font-medium">
                Your membership has expired. Please visit Reception to renew your membership.
              </p>
            </div>
            <div className="bg-red-400/10 border border-red-400/30 text-red-300 rounded-xl px-4 py-2.5 text-xs font-semibold self-start sm:self-center">
              Renewal managed at Reception
            </div>
          </div>
        ) : accessDecision.allowed ? (
          /* Case B: Active + Currently Allowed */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-lime-400/20 text-lime-400 border border-lime-400/30">
                  <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse" />
                  GYM FLOOR OPEN
                </span>
                {isExpiring && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-400/15 text-yellow-400 border border-yellow-400/25">
                    <Warning weight="fill" className="w-3 h-3" />
                    Expiring in {daysRemaining} day{daysRemaining === 1 ? "" : "s"}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-800 text-zinc-300">
                  <Sparkle weight="fill" className="w-3 h-3 text-lime-400" />
                  {categoryLabelOf(state, "REGULAR")}
                </span>
              </div>
              <h3 className="text-xl font-black text-white">Access Available Today</h3>
              <p className="text-zinc-400 text-sm mt-1 max-w-xl">
                {todayRules.length > 0 ? (
                  <>
                    Today&apos;s open window:{" "}
                    <span className="text-lime-400 font-semibold">
                      {todayRules.map(r => `${r.startTime} – ${r.endTime}`).join(", ")}
                    </span>
                    . {ruleDescription}
                  </>
                ) : (
                  <>Full open access with no scheduled time restriction. {ruleDescription}</>
                )}
              </p>
            </div>
            <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-4 py-3 text-left sm:text-right shrink-0">
              <span className="text-[11px] uppercase tracking-wider text-zinc-400 block font-semibold">
                Current Status
              </span>
              <span className="text-base font-bold text-lime-400 flex items-center sm:justify-end gap-1.5 mt-0.5">
                <CheckCircle weight="fill" className="w-4 h-4 text-lime-400" />
                Access Authorized
              </span>
            </div>
          </div>
        ) : (
          /* Case C: Active + Outside Allowed Hours */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-400/20 text-amber-400 border border-amber-400/30 mb-2">
                <Clock weight="fill" className="w-3.5 h-3.5" />
                OUTSIDE ACCESS HOURS
              </div>
              <h3 className="text-xl font-black text-white">Gym Floor Currently Closed</h3>
              <p className="text-zinc-400 text-sm mt-1 max-w-xl">
                You are registered for regular membership, but the gym is currently outside
                authorized check-in hours on{" "}
                <span className="text-white font-medium">{currentDayName}</span>.
              </p>
              {nextOpeningText && (
                <p className="text-xs text-amber-400 font-semibold mt-2">
                  Next opening: {nextOpeningText}
                </p>
              )}
            </div>
            <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-4 py-3 text-left sm:text-right shrink-0">
              <span className="text-[11px] uppercase tracking-wider text-zinc-400 block font-semibold">
                Scheduled Today
              </span>
              <span className="text-sm font-bold text-zinc-300 block mt-0.5">
                {todayRules.length > 0
                  ? todayRules.map(r => `${r.startTime} – ${r.endTime}`).join(", ")
                  : "No window today"}
              </span>
            </div>
          </div>
        )}
      </motion.div>

      {/* 2. WEEKLY FLOOR ACCESS SCHEDULE */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2 text-white">
              <CalendarDots weight="fill" className="w-5 h-5 text-lime-400" />
              Weekly Floor Access Schedule
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Active operating schedule for regular gym members. Standard membership provides
              unrestricted open-floor training.
            </p>
          </div>
          {todayRules.length > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 font-mono shrink-0 self-start sm:self-auto border border-zinc-700/60">
              Today: {todayRules.map(r => `${r.startTime}–${r.endTime}`).join(", ")}
            </span>
          )}
        </div>

        {/* 7-Day Responsive Grid: 2 cols on mobile, 4 on tablet, 7 on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 my-3">
          {weeklySchedule.map(item => (
            <div
              key={item.day}
              className={`p-3 rounded-xl flex flex-col justify-between transition-all border ${
                item.isToday
                  ? "bg-lime-400 text-zinc-950 border-lime-400 shadow-lg shadow-lime-400/10 font-bold"
                  : item.isOpen
                  ? "bg-zinc-850/70 border-zinc-800 text-zinc-200"
                  : "bg-zinc-900/40 border-zinc-800/50 text-zinc-500"
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-xs font-black uppercase tracking-tight">
                  {DAY_ABBR[item.day] || item.day.slice(0, 3)}
                </span>
                {item.isToday ? (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-950 text-lime-400 font-extrabold">
                    Today
                  </span>
                ) : (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      item.isOpen ? "bg-lime-400" : "bg-zinc-600"
                    }`}
                  />
                )}
              </div>

              <div className="space-y-0.5">
                {item.windows.map((win, idx) => (
                  <div
                    key={idx}
                    className={`text-xs font-mono font-semibold truncate ${
                      item.isToday ? "text-zinc-950" : "text-white"
                    }`}
                    title={win}
                  >
                    {win}
                  </div>
                ))}
              </div>

              <div
                className={`text-[10px] mt-2 pt-1 border-t truncate ${
                  item.isToday
                    ? "border-zinc-950/20 text-zinc-800"
                    : "border-zinc-800 text-zinc-400"
                }`}
              >
                {item.isToday ? "Active Today" : item.subtitle}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-zinc-400 gap-2">
          <div className="flex items-center gap-1.5">
            <ShieldCheck weight="fill" className="w-4 h-4 text-lime-400 shrink-0" />
            <span>Schedule governed by club access policy: <strong>{ruleDescription}</strong></span>
          </div>
          <span className="text-zinc-500 text-[11px]">Check-in verified at reception counter</span>
        </div>
      </div>

      {/* 3. TRAINING ZONES & FACILITIES */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2 text-white">
              <Barbell weight="fill" className="w-5 h-5 text-lime-400" />
              Training Zones &amp; Club Facilities
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Available facilities for standard membership workouts and conditioning.
            </p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-lime-400/10 text-lime-400 border border-lime-400/20 font-semibold hidden sm:inline-block">
            Full Floor Privileges
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FACILITIES.map((facility, index) => {
            const FacilityIcon = facility.icon;
            return (
              <div
                key={index}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between hover:border-zinc-700 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center shrink-0">
                        <FacilityIcon weight="fill" className="w-5 h-5 text-lime-400" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-white">{facility.title}</h4>
                        <span className="text-xs text-zinc-400">{facility.subtitle}</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 shrink-0">
                      {facility.highlight}
                    </span>
                  </div>

                  <ul className="space-y-1.5 mt-3 pt-3 border-t border-zinc-800/80">
                    {facility.items.map((item, itemIdx) => (
                      <li
                        key={itemIdx}
                        className="text-xs text-zinc-300 flex items-center gap-2"
                      >
                        <CheckCircle
                          weight="fill"
                          className="w-3.5 h-3.5 text-lime-400 shrink-0"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. CLUB GUIDELINES & FLOOR ETIQUETTE */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h3 className="font-bold text-base flex items-center gap-2 text-white mb-1">
          <Info weight="fill" className="w-5 h-5 text-lime-400" />
          Club Guidelines &amp; Floor Etiquette
        </h3>
        <p className="text-xs text-zinc-400 mb-4">
          Please help maintain a professional, safe, and welcoming training environment for all members.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Floor Rules */}
          <div className="space-y-2.5">
            <div className="bg-zinc-800/50 border border-zinc-800 rounded-xl p-3 flex items-start gap-2.5">
              <CheckCircle weight="fill" className="w-4 h-4 text-lime-400 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-white block">Re-rack All Weights</span>
                <span className="text-zinc-400">
                  Return dumbbells, plates, and attachments to their proper storage trees immediately
                  after use.
                </span>
              </div>
            </div>

            <div className="bg-zinc-800/50 border border-zinc-800 rounded-xl p-3 flex items-start gap-2.5">
              <CheckCircle weight="fill" className="w-4 h-4 text-lime-400 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-white block">Sanitize &amp; Wipe Equipment</span>
                <span className="text-zinc-400">
                  Use the provided spray bottles and towels to wipe benches and handles after your
                  sets.
                </span>
              </div>
            </div>

            <div className="bg-zinc-800/50 border border-zinc-800 rounded-xl p-3 flex items-start gap-2.5">
              <CheckCircle weight="fill" className="w-4 h-4 text-lime-400 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-white block">Proper Training Attire</span>
                <span className="text-zinc-400">
                  Clean athletic clothing and closed-toe athletic footwear are mandatory across the
                  training floor.
                </span>
              </div>
            </div>
          </div>

          {/* Traffic & Best Hours Guidance */}
          <div className="space-y-2.5">
            <div className="bg-zinc-800/50 border border-zinc-850 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-lime-400" />
                  Traffic Guidance (Informational)
                </span>
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                  Club Trend
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Regular members may train at any time during open hours. Plan your session using typical traffic patterns:
              </p>

              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-[11px] bg-zinc-900/60 rounded-lg p-2 border border-zinc-800">
                  <span className="text-zinc-300 font-medium">09:00 – 16:00 (Quieter period)</span>
                  <span className="text-lime-400 font-bold">Optimal rack availability</span>
                </div>
                <div className="flex justify-between items-center text-[11px] bg-zinc-900/60 rounded-lg p-2 border border-zinc-800">
                  <span className="text-zinc-300 font-medium">17:30 – 20:00 (Peak hours)</span>
                  <span className="text-amber-400 font-bold">Typical busy period</span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-800/50 border border-zinc-800 rounded-xl p-3 flex items-start gap-2.5">
              <CheckCircle weight="fill" className="w-4 h-4 text-lime-400 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-white block">Share Equipment Gracefully</span>
                <span className="text-zinc-400">
                  Allow fellow gym members to work in between sets and avoid sitting on stations
                  during extended rest periods.
                </span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500 mt-4 pt-3 border-t border-zinc-800">
          Need coaching guidance or plan upgrades? Speak with our reception staff or visit the trainer desk.
        </p>
      </div>
    </div>
  );
}
