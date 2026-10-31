import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Fire,
  Warning,
  XCircle,
  Lightning,
  ShieldCheck,
  Lockers,
} from "@phosphor-icons/react";
import type { Member } from "../types";

interface CustomerMotivationalHeroProps {
  member: Member;
  daysRemaining: number;
  countdownState: "active" | "expiring" | "expired";
  progress: number;
  planName?: string;
  planPrice?: number;
  steamLeft?: number | string;
  categoryLabel: string;
  lockerNumber?: string | number;
  isStudent?: boolean;
  isMuslim?: boolean;
  hasActiveMembership?: boolean;
}

export default function CustomerMotivationalHero({
  member,
  daysRemaining,
  countdownState,
  progress,
  planName,
  planPrice,
  steamLeft,
  categoryLabel,
  lockerNumber,
  isStudent = false,
  isMuslim = false,
  hasActiveMembership = true,
}: CustomerMotivationalHeroProps) {
  // Check customer's saved gender field directly (do not infer from name or category)
  const isMale = useMemo(() => {
    const raw = (member.gender || "").trim().toLowerCase();
    return raw === "male" || raw === "m";
  }, [member.gender]);

  const firstName = useMemo(() => {
    return member.name.trim().split(" ")[0] || "Athlete";
  }, [member.name]);

  const formattedExpiry = useMemo(() => {
    if (!member.expiryDate || member.expiryDate === "—") return "—";
    const d = new Date(member.expiryDate);
    return isNaN(d.getTime()) ? member.expiryDate : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }, [member.expiryDate]);

  return (
    <div className="relative rounded-3xl overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl">
      {/* ------------------------------------------------------------------ */}
      {/* BACKGROUND LAYER                                                  */}
      {/* ------------------------------------------------------------------ */}
      {isMale ? (
        // Male customer specific visual: Powerful male bodybuilder in gritty gym lighting
        <div className="absolute inset-0 z-0">
          <img
            src="/images/gym-hero-male.jpg"
            alt="PowerPlus Male Athlete"
            className="w-full h-full object-cover object-top sm:object-center opacity-65 md:opacity-80 scale-100 transition-transform duration-700 hover:scale-105"
          />
          {/* Multi-layered dark gradient overlays for maximum text legibility & gritty urban atmosphere */}
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/85 to-zinc-950/40 md:via-zinc-950/75 md:to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent" />
          <div className="absolute inset-0 bg-zinc-950/30 backdrop-contrast-125" />
        </div>
      ) : (
        // Female or general customer visual: Sleek dark high-energy urban gym atmosphere
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-lime-500/10 via-transparent to-transparent" />
          {/* Subtle gym mesh pattern overlay */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
              backgroundSize: "24px 24px",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
        </div>
      )}

      {/* Decorative painted-wall watermark text in background */}
      <div className="absolute right-4 bottom-2 z-0 select-none pointer-events-none opacity-[0.04] sm:opacity-[0.06] font-black uppercase text-7xl sm:text-9xl text-white tracking-tighter leading-none whitespace-nowrap overflow-hidden">
        POWERPLUS
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* FOREGROUND CONTENT                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative z-10 p-6 sm:p-8 lg:p-10 flex flex-col justify-between min-h-[460px] lg:min-h-[500px]">
        {/* Top Bar: Athlete Division Badges & Status */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/20">
              <Lightning weight="fill" className="w-3.5 h-3.5" />
              <span>LOCK IN</span>
            </span>

            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-zinc-900/90 text-zinc-300 border border-zinc-700/60 backdrop-blur-md">
              <ShieldCheck weight="fill" className="w-3.5 h-3.5 text-lime-400" />
              <span>{categoryLabel}</span>
            </span>

            {member.gender && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-zinc-900/80 text-zinc-400 border border-zinc-800">
                <span>{member.gender}</span>
              </span>
            )}

            {lockerNumber && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-400/15 text-amber-300 border border-amber-400/30">
                <Lockers weight="fill" className="w-3.5 h-3.5" />
                <span>Locker #{lockerNumber}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono tracking-wider text-zinc-400 uppercase">
              ID: <span className="font-bold text-white">{member.memberId}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                countdownState === "active"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : countdownState === "expiring"
                  ? "bg-yellow-400/20 text-yellow-300 border border-yellow-400/30"
                  : "bg-red-500/20 text-red-400 border border-red-500/30"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  countdownState === "active"
                    ? "bg-emerald-400 shadow-sm shadow-emerald-400/80 animate-pulse"
                    : countdownState === "expiring"
                    ? "bg-yellow-400 shadow-sm shadow-yellow-400/80"
                    : "bg-red-400 shadow-sm shadow-red-400/80"
                }`}
              />
              <span>{countdownState.toUpperCase()}</span>
            </span>
          </div>
        </div>

        {/* Center: Painted Wall Typography Composition */}
        <div className="my-6 lg:my-8 max-w-2xl">
          {/* Urban Street Stencil Accent Line */}
          <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-widest text-lime-400 uppercase mb-2">
            <Fire weight="fill" className="w-4 h-4 text-lime-400 animate-pulse" />
            <span>DISCIPLINE OVER MOTIVATION · DAILY MISSION</span>
          </div>

          {/* Main Headline (Painted Wall Art Aesthetic) */}
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl sm:text-6xl lg:text-7xl font-black uppercase tracking-tighter text-white leading-[0.92] drop-shadow-md"
          >
            YOU <span className="text-lime-400">VS</span> YOU.
          </motion.h1>

          {/* Sub-slogans in dynamic wall layout */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:text-sm font-black uppercase tracking-wider text-zinc-300"
          >
            <span className="text-zinc-200">NO PAIN, NO GAIN.</span>
            <span className="text-zinc-600">/</span>
            <span className="text-white">ONE MORE REP.</span>
            <span className="text-zinc-600">/</span>
            <span className="text-lime-400">BUILT NOT GIVEN.</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-300">TRUST THE PROCESS.</span>
            <span className="text-zinc-600">/</span>
            <span className="text-amber-300">NO EXCUSES.</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-200">STAY DISCIPLINED.</span>
            <span className="text-zinc-600">/</span>
            <span className="text-emerald-400">EVERY REP COUNTS.</span>
          </motion.div>

          <p className="mt-4 text-xs sm:text-sm text-zinc-400 max-w-lg leading-relaxed">
            Welcome back, <span className="font-bold text-white">{firstName}</span>. Every single workout brings you closer to your peak physique. Stay relentless and dominate the session.
          </p>
        </div>

        {/* Bottom Panel: Membership Countdown & Operational Information */}
        <div className="pt-4 border-t border-zinc-800/80">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Membership Details */}
            <div className="md:col-span-8 space-y-2">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                <span className="text-zinc-400">
                  Plan: <span className="text-white font-bold">{planName || (isMuslim ? "Women's Access" : "Standard Access")}</span>
                </span>
                {planPrice != null && (
                  <span className="text-zinc-400">
                    Fee: <span className="text-lime-400 font-bold">{planPrice} ETB</span>
                  </span>
                )}
                {member.expiryDate && member.expiryDate !== "—" && (
                  <span className="text-zinc-400">
                    Expires: <span className="text-white font-semibold">{formattedExpiry}</span>
                  </span>
                )}
                {steamLeft !== undefined && !isStudent && (
                  <span className="text-zinc-400">
                    Steam: <span className="text-cyan-400 font-bold">{steamLeft} sessions</span>
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              {hasActiveMembership && (
                <div className="space-y-1.5">
                  <div className="relative bg-zinc-800/90 rounded-full h-2.5 overflow-hidden border border-zinc-700/50">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={`h-full rounded-full ${
                        countdownState === "expired"
                          ? "bg-red-500"
                          : countdownState === "expiring"
                          ? "bg-gradient-to-r from-yellow-500 to-amber-400"
                          : "bg-gradient-to-r from-lime-500 via-lime-400 to-emerald-400"
                      }`}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-zinc-500 font-mono">
                    <span>{Math.round(progress)}% of cycle completed</span>
                    <span>{countdownState === "expired" ? "Cycle ended" : `${daysRemaining} days remaining`}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Countdown Big Display */}
            {hasActiveMembership && (
              <div className="md:col-span-4 flex items-center justify-start md:justify-end gap-3.5 bg-zinc-900/70 border border-zinc-800/70 p-3 rounded-2xl backdrop-blur-md">
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {countdownState === "expired" ? "Status" : "Membership"}
                  </div>
                  <div className="text-xs font-bold text-zinc-300">
                    {countdownState === "expired"
                      ? "Expired"
                      : daysRemaining === 1
                      ? "Day Left"
                      : "Days Left"}
                  </div>
                </div>
                <div
                  className={`text-4xl sm:text-5xl font-black font-mono tabular-nums leading-none ${
                    countdownState === "active"
                      ? "text-lime-400"
                      : countdownState === "expiring"
                      ? "text-yellow-400"
                      : "text-red-400"
                  }`}
                >
                  {daysRemaining}
                </div>
              </div>
            )}
          </div>

          {/* EXPIRED ALERT BANNER (Instructs member to visit Reception) */}
          {countdownState === "expired" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/15 p-4 flex items-center gap-3 text-sm text-red-200 shadow-lg shadow-red-500/10"
            >
              <XCircle weight="fill" className="w-5 h-5 text-red-400 shrink-0" />
              <div className="font-bold">
                Your membership has expired. Please visit Reception to renew your membership.
              </div>
            </motion.div>
          )}

          {/* EXPIRING SOON WARNING BANNER */}
          {countdownState === "expiring" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-2xl border border-yellow-400/40 bg-yellow-400/15 p-3.5 flex items-center gap-3 text-sm text-yellow-200"
            >
              <Warning weight="fill" className="w-5 h-5 text-yellow-400 shrink-0" />
              <div>
                Your membership is expiring soon (
                <span className="font-bold text-white">
                  {daysRemaining === 1 ? "1 day left" : `${daysRemaining} days left`}
                </span>
                ). Please visit Reception to renew your membership.
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
