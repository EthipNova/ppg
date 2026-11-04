import {
  Warning,
  XCircle,
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
  categoryLabel,
  lockerNumber,
  hasActiveMembership = true,
}: CustomerMotivationalHeroProps) {
  const memberDisplayId = member.memberId || "PP-MEMBER";

  return (
    <div className="relative rounded-3xl overflow-hidden border border-zinc-800/90 shadow-2xl select-none bg-[#111111]">
      {/* ------------------------------------------------------------------ */}
      {/* BACKGROUND: Dark Charcoal / Deep Black with Subtle Crimson Accent */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 90% 60% at 50% -10%, rgba(139, 29, 36, 0.28) 0%, rgba(26, 26, 26, 0.95) 55%, #111111 100%)",
        }}
      >
        {/* Subtle geometric grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Ambient corner vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-transparent to-black/20" />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* FOREGROUND CONTENT: Compact, Logo-Centered, Athletic Brand Hero    */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative z-10 px-4 py-4 sm:px-7 sm:py-5 flex flex-col justify-between gap-3 sm:gap-4">
        {/* Top Status Strip: Category, Locker Tag, Member ID, Status Pill */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-zinc-900 border border-zinc-700/80 text-zinc-200 shadow-sm">
              <ShieldCheck weight="fill" className="w-3.5 h-3.5 text-[#8B1D24]" />
              <span>{categoryLabel}</span>
            </span>

            {member.gender && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider bg-zinc-800/80 text-zinc-300 border border-zinc-700/50">
                {member.gender}
              </span>
            )}

            {lockerNumber && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-[#8B1D24]/20 text-red-200 border border-[#8B1D24]/40">
                <Lockers weight="fill" className="w-3.5 h-3.5 text-[#8B1D24]" />
                <span>Locker #{lockerNumber}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] sm:text-[11px] font-mono font-bold tracking-wider text-zinc-400 uppercase">
              ID: <span className="font-black text-[#F5F5F5]">{memberDisplayId}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider shadow-sm ${
                countdownState === "active"
                  ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700/50"
                  : countdownState === "expiring"
                  ? "bg-amber-950/80 text-amber-300 border border-amber-700/50"
                  : "bg-red-950/90 text-red-200 border border-red-800/60"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  countdownState === "active"
                    ? "bg-emerald-400 animate-pulse"
                    : countdownState === "expiring"
                    ? "bg-amber-400"
                    : "bg-red-400"
                }`}
              />
              <span>{countdownState.toUpperCase()}</span>
            </span>
          </div>
        </div>

        {/* Center: Preserved PowerPlus Brand Identity & Exact Slogan in Crisp Contrast */}
        <div className="my-0.5 sm:my-1 flex items-center justify-center">
          <svg
            viewBox="0 0 740 156"
            className="w-full max-w-[540px] h-auto select-none overflow-visible"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="Power GYM PLUS - Train hard Live strong"
          >
            <defs>
              {/* Subtle raised depth effect for slogan on dark background */}
              <filter id="raised-slogan" x="-10%" y="-10%" width="120%" height="130%">
                <feDropShadow dx="0" dy="1.5" stdDeviation="0.8" floodColor="#000000" floodOpacity="0.85" />
              </filter>

              {/* Logo depth filter */}
              <filter id="logo-depth" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.6" />
              </filter>
            </defs>

            {/* BRAND LOGO COMPOSITION: Power GYM PLUS */}
            <g filter="url(#logo-depth)">
              {/* Heavy geometric uppercase P in clean light tone */}
              <text
                x="30"
                y="86"
                fill="#F5F5F5"
                fontFamily="'Arial Black', 'Impact', sans-serif"
                fontSize="84"
                fontWeight="900"
                letterSpacing="-2"
              >
                P
              </text>

              {/* Custom dumbbell / flexed-arm emblem representing the letter O */}
              <g transform="translate(98, 22)">
                {/* Outer muscular curved contour forming the O */}
                <rect x="0" y="8" width="56" height="56" rx="14" fill="#1C1C1C" stroke="#2D2D2D" strokeWidth="1.5" />
                <rect x="13" y="19" width="30" height="34" rx="8" fill="#111111" />
                {/* Horizontal barbell bar shaft through the emblem */}
                <rect x="6" y="32" width="44" height="8" rx="2" fill="#F5F5F5" />
                {/* Dumbbell left & right weight plates */}
                <rect x="3" y="21" width="6" height="30" rx="2" fill="#E0E0E0" />
                <rect x="47" y="21" width="6" height="30" rx="2" fill="#E0E0E0" />
                {/* Center emblem accent in crimson */}
                <circle cx="28" cy="36" r="3.5" fill="#8B1D24" />
              </g>

              {/* The letters 'wer' in athletic crimson */}
              <text
                x="165"
                y="86"
                fill="#8B1D24"
                fontFamily="'Arial Black', 'Impact', sans-serif"
                fontSize="74"
                fontWeight="900"
                letterSpacing="-2"
              >
                wer
              </text>

              {/* Underline-style container beneath 'wer' in contrasting light tone */}
              <path
                d="M 163 94 L 163 89 M 163 94 L 302 94 M 302 94 L 302 89"
                stroke="#F5F5F5"
                strokeWidth="4"
                strokeLinecap="square"
              />

              {/* Small plus sign (+) at the upper-right of the letter r in light tone */}
              <g transform="translate(298, 26)">
                <path
                  d="M 6 0 L 6 12 M 0 6 L 12 6"
                  stroke="#F5F5F5"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              </g>

              {/* 'GYM' in athletic condensed italic crimson lettering */}
              <text
                x="332"
                y="52"
                fill="#8B1D24"
                fontFamily="'Impact', 'Barlow Condensed', 'Arial Black', sans-serif"
                fontSize="40"
                fontWeight="900"
                fontStyle="italic"
                letterSpacing="2"
              >
                GYM
              </text>

              {/* 'PLUS' in uppercase crimson lettering with approx 0.25em letter spacing */}
              <text
                x="332"
                y="88"
                fill="#8B1D24"
                fontFamily="'Arial Black', 'Impact', sans-serif"
                fontSize="48"
                fontWeight="900"
                letterSpacing="0.25em"
              >
                PLUS
              </text>
            </g>

            {/* EXACT SLOGAN: Train hard Live strong */}
            {/* Bold athletic display font with high contrast light text (#F5F5F5) and barbell details on T and L */}
            <g filter="url(#raised-slogan)">
              {/* Barbell plates detail on capital T crossbar */}
              <rect x="29" y="117" width="3.5" height="12" rx="1" fill="#F5F5F5" />
              <rect x="53" y="117" width="3.5" height="12" rx="1" fill="#F5F5F5" />

              {/* Barbell plates detail on capital L foot */}
              <rect x="254" y="132" width="3" height="10" rx="1" fill="#F5F5F5" />
              <rect x="272" y="132" width="3" height="10" rx="1" fill="#F5F5F5" />

              <text
                x="32"
                y="138"
                fill="#F5F5F5"
                fontFamily="'Impact', 'Bebas Neue', 'Barlow Condensed', 'Arial Black', sans-serif"
                fontSize="31"
                fontWeight="900"
                letterSpacing="3"
              >
                Train hard Live strong
              </text>
            </g>
          </svg>
        </div>

        {/* Bottom Strip: Expired / Expiring Alerts or Compact Cycle Bar */}
        {countdownState === "expired" ? (
          <div className="rounded-xl border border-red-800/60 bg-red-950/80 p-2.5 sm:p-3 flex items-center gap-2.5 text-xs text-red-200">
            <XCircle weight="fill" className="w-4 h-4 text-red-400 shrink-0" />
            <div className="font-bold">
              Your membership has expired. Please visit Reception to renew your membership.
            </div>
          </div>
        ) : countdownState === "expiring" ? (
          <div className="rounded-xl border border-amber-800/60 bg-amber-950/80 p-2.5 sm:p-3 flex items-center gap-2.5 text-xs text-amber-200">
            <Warning weight="fill" className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              Membership expiring soon (
              <span className="font-bold text-white">
                {daysRemaining === 1 ? "1 day left" : `${daysRemaining} days left`}
              </span>
              ). Please visit Reception to renew.
            </div>
          </div>
        ) : hasActiveMembership ? (
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs font-semibold text-zinc-400">
            <span>Active Membership Cycle</span>
            <span className="font-mono font-bold text-[#F5F5F5]">
              {daysRemaining} {daysRemaining === 1 ? "day" : "days"} remaining
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
