import { useState } from "react";
import { motion } from "framer-motion";
import { Drop, Waves, CheckCircle, XCircle, CreditCard, Timer, Coins, ArrowsClockwise } from "@phosphor-icons/react";
import {
  useGym,
  formatETB,
  computeSteamStatus,
  activeSteamAccess,
  steamAccessFor,
  sellSteamAccess,
  recordSteamUsage,
} from "../context/GymContext";
import type { Member, Payment, SteamAccess, SteamStatus, SteamType, SteamUsage } from "../types";
import type { CustomerSteamAccess, CustomerSteamUsage } from "../services/steamService";
import { determinePassState } from "../services/steamService";
import { toast } from "sonner";

const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-6";
const METHOD_LABELS: Record<string, string> = { telebirr: "Telebirr", cbe_birr: "CBE Birr", cash: "Cash", card: "Card" };

const STATUS_STYLES: Record<SteamStatus, string> = {
  "Active": "bg-lime-400/20 text-lime-400",
  "Expiring Soon": "bg-yellow-400/20 text-yellow-400",
  "Expired": "bg-red-400/20 text-red-400",
  "Cancelled": "bg-zinc-500/20 text-zinc-400",
};

export function SteamStatusBadge({ status }: { status: SteamStatus }) {
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLES[status]}`}>{status}</span>;
}

export function SteamAccessCard({ access }: { access: SteamAccess }) {
  const { state } = useGym();
  const status = computeSteamStatus(access, state.settings);
  const isPackage = access.type === "package";
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-cyan-400/15 flex items-center justify-center">
          {isPackage ? <Coins weight="fill" className="w-5 h-5 text-cyan-400" /> : <Timer weight="fill" className="w-5 h-5 text-cyan-400" />}
        </div>
        <div>
          <div className="font-semibold text-sm">{isPackage ? "Steam Package" : "Single Session"}</div>
          <div className="text-xs text-zinc-500">Valid until {new Date(access.endDate).toLocaleDateString("en-US")}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-black text-cyan-400">{access.remainingVisits}</div>
        <div className="text-[10px] text-zinc-500 uppercase">session(s)</div>
        <div className="mt-1"><SteamStatusBadge status={status} /></div>
      </div>
    </div>
  );
}

export function LiveSteamAccessCard({ access }: { access: CustomerSteamAccess }) {
  const status = determinePassState(access);
  const isPackage = access.type === "package";
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-cyan-400/15 flex items-center justify-center shrink-0">
            {isPackage ? <Coins weight="fill" className="w-5 h-5 text-cyan-400" /> : <Timer weight="fill" className="w-5 h-5 text-cyan-400" />}
          </div>
          <div>
            <div className="font-semibold text-sm text-white">{access.serviceName || (isPackage ? "Steam Package" : "Single Session")}</div>
            <div className="text-xs text-zinc-400">
              {access.startDate ? `${new Date(access.startDate).toLocaleDateString("en-US")} – ` : ""}
              Valid until {access.endDate ? new Date(access.endDate).toLocaleDateString("en-US") : "N/A"}
            </div>
          </div>
        </div>
        <div className="text-right">
          <SteamStatusBadge status={status === "No Active Pass" ? "Expired" : status} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-700/50 text-xs">
        <div className="bg-zinc-900/60 rounded-lg p-2 text-center">
          <div className="text-zinc-500 text-[10px] uppercase">Remaining</div>
          <div className="font-black text-cyan-400 text-base">{access.usageLimit === null ? "∞" : Math.max(0, access.usageLimit - access.usageCount)}</div>
        </div>
        <div className="bg-zinc-900/60 rounded-lg p-2 text-center">
          <div className="text-zinc-500 text-[10px] uppercase">Total Visits</div>
          <div className="font-black text-white text-base">{access.usageLimit === null ? "Unlimited" : access.totalVisits}</div>
        </div>
        <div className="bg-zinc-900/60 rounded-lg p-2 text-center">
          <div className="text-zinc-500 text-[10px] uppercase">Price</div>
          <div className="font-black text-lime-400 text-base">{formatETB(access.price)} {access.currency}</div>
        </div>
        <div className="bg-zinc-900/60 rounded-lg p-2 text-center"><div className="text-zinc-500 text-[10px] uppercase">Payment</div><div className="font-semibold text-white">{access.paymentStatus} · {access.paymentMethod}</div></div>
        <div className="bg-zinc-900/60 rounded-lg p-2 text-center"><div className="text-zinc-500 text-[10px] uppercase">Purchased</div><div className="font-semibold text-white">{access.createdAt.slice(0, 10)}</div></div>
      </div>
    </div>
  );
}

export function SteamUsageLog({
  memberId,
  liveUsage,
}: {
  memberId: string;
  liveUsage?: CustomerSteamUsage[];
}) {
  const { state } = useGym();
  const isLive = Boolean(liveUsage !== undefined);
  const entries = liveUsage ?? state.steamUsage.filter(u => u.customerId === memberId);

  return (
    <div className={CARD}>
      <h3 className="font-bold mb-3 flex items-center gap-2">
        <Waves className="w-5 h-5 text-cyan-400" /> Steam History
      </h3>
      <div className="space-y-2">
        {entries.length === 0 && <p className="text-sm text-zinc-500">No Steam entry recorded.</p>}
        {isLive
          ? (liveUsage || []).slice(0, 10).map(u => (
              <div key={u.id} className="flex justify-between items-center text-sm py-2.5 border-b border-zinc-800/50">
                <div className="flex items-center gap-2.5">
                  <Drop weight="fill" className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div>
                    <div className="font-medium text-white">{u.note || "Steam Entry"}</div>
                    <div className="text-[11px] text-zinc-400">
                      Visits used: {u.visitsUsed} · Remaining: {u.remainingAfter}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-zinc-400 text-xs">
                    {new Date(u.usedAt).toLocaleDateString("en-US")}
                  </div>
                  <div className="text-zinc-500 text-[11px]">
                    {new Date(u.usedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    {u.loggedBy ? ` · ${u.loggedBy}` : ""}
                  </div>
                </div>
              </div>
            ))
          : (entries as SteamUsage[]).slice(0, 10).map(u => (
              <div key={u.id} className="flex justify-between items-center text-sm py-2 border-b border-zinc-800/50">
                <div className="flex items-center gap-2">
                  <Drop weight="fill" className="w-4 h-4 text-cyan-400" />
                  <span>{u.notes || "Steam Entry"}</span>
                </div>
                <div className="text-right">
                  <div className="text-zinc-500 text-xs">{new Date(u.timestamp).toLocaleDateString("en-US")}</div>
                  <div className="text-zinc-600 text-[11px]">{new Date(u.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} · {u.recordedBy}</div>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}

export function SteamPurchaseForm({ member, actor }: { member: Member; actor: string }) {
  const { state, dispatch } = useGym();
  const settings = state.settings;
  const model = settings.steamModel;
  const canPackage = model === "package" || model === "both";
  const canPerVisit = model === "per_visit" || model === "both";
  const [type, setType] = useState<SteamType>(canPackage ? "package" : "per_visit");
  const [method, setMethod] = useState<Payment["method"]>("telebirr");
  const [busy, setBusy] = useState(false);

  const price = type === "package" ? settings.steamPackagePrice : settings.steamPerVisitPrice;

  if (!settings.steamEnabled) {
    return (
      <div className={`${CARD} text-center`}>
        <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-zinc-400">The Steam module is disabled by management.</p>
      </div>
    );
  }

  const handleBuy = () => {
    setBusy(true);
    setTimeout(() => {
      sellSteamAccess(state, dispatch, member, type, method, actor);
      toast.success(`${member.name} — Steam access sold (${formatETB(price)}).`);
      setBusy(false);
    }, 400);
  };

  return (
    <div className={`${CARD} space-y-4`}>
      <h3 className="font-bold text-lg flex items-center gap-2"><Drop weight="fill" className="w-5 h-5 text-cyan-400" /> Sell Steam Access</h3>
      {model === "both" && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setType("package")} className={`px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${type === "package" ? "bg-cyan-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>Package · {settings.steamPackageVisits} sessions</button>
          <button onClick={() => setType("per_visit")} className={`px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${type === "per_visit" ? "bg-cyan-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>Single Session</button>
        </div>
      )}
      <div>
        <label className="text-xs text-zinc-500 block mb-2">Payment method</label>
        <div className="grid grid-cols-2 gap-2">
          {(["telebirr", "cbe_birr", "cash", "card"] as const).map(m => (
            <button key={m} onClick={() => setMethod(m)} className={`px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${method === m ? "bg-cyan-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>{METHOD_LABELS[m]}</button>
          ))}
        </div>
      </div>
      <div className="bg-zinc-800/50 rounded-xl p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-zinc-400">Client</span><span className="font-semibold">{member.name}</span></div>
        <div className="flex justify-between"><span className="text-zinc-400">Validity</span><span className="font-semibold">{settings.steamPackageDays} days</span></div>
        <div className="flex justify-between border-t border-zinc-700 pt-2"><span className="text-zinc-400">Total</span><span className="font-black text-cyan-400 text-lg">{formatETB(price)}</span></div>
      </div>
      <button onClick={handleBuy} disabled={busy || (type === "package" && !canPackage) || (type === "per_visit" && !canPerVisit)} className="w-full bg-cyan-400 text-zinc-950 font-bold py-3.5 rounded-xl hover:bg-cyan-300 transition-colors disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2">
        <CreditCard className="w-5 h-5" /> {busy ? "Processing..." : `Confirm ${formatETB(price)}`}
      </button>
    </div>
  );
}

export function SteamCheckInButton({ member, actor }: { member: Member; actor: string }) {
  const { state, dispatch } = useGym();
  const access = activeSteamAccess(state, member.id);
  const [busy, setBusy] = useState(false);

  const handleEntry = () => {
    setBusy(true);
    setTimeout(() => {
      const res = recordSteamUsage(state, dispatch, member, actor, "Manual reception entry");
      if (res.ok) toast.success(res.message); else toast.error(res.message);
      setBusy(false);
    }, 300);
  };

  if (!access) {
    return (
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 flex items-center gap-3 text-sm text-zinc-400">
        <XCircle className="w-5 h-5 text-red-400 shrink-0" /> No valid Steam access — sell a package or a single session.
      </div>
    );
  }
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={handleEntry} disabled={busy} className="w-full bg-cyan-400 text-zinc-950 font-bold py-3 rounded-xl hover:bg-cyan-300 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
      <ArrowsClockwise className={`w-5 h-5 ${busy ? "animate-spin" : ""}`} /> Record a Steam entry ({access.remainingVisits} left)
    </motion.button>
  );
}

export function SteamOverview({
  memberId,
  livePasses,
}: {
  memberId: string;
  livePasses?: CustomerSteamAccess[];
}) {
  const { state } = useGym();
  const isLive = Boolean(livePasses !== undefined);
  const accesses = livePasses ?? steamAccessFor(state, memberId);

  return (
    <div className={CARD}>
      <h3 className="font-bold mb-3 flex items-center gap-2">
        <Waves className="w-5 h-5 text-cyan-400" /> Steam Access
      </h3>
      <div className="space-y-2">
        {accesses.length === 0 && (
          <div className="bg-zinc-800/50 border border-zinc-700/70 rounded-xl p-5 text-center">
            <Drop weight="fill" className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
            <div className="font-bold text-white text-sm">No Active Steam Pass</div>
            <p className="text-xs text-zinc-400 mt-1">Purchase a Day Pass or Visit Package at reception.</p>
          </div>
        )}
        {isLive
          ? (livePasses || []).map(a => <LiveSteamAccessCard key={a.id} access={a} />)
          : (accesses as SteamAccess[]).map(a => <SteamAccessCard key={a.id} access={a} />)}
      </div>
    </div>
  );
}

export function SteamReceptionPurchaseNotice() {
  const { state } = useGym();
  const settings = state.settings;
  const packagePrice = settings.steamPackagePrice || 1200;
  const singlePrice = settings.steamPerVisitPrice || 150;
  const packageVisits = settings.steamPackageVisits || 10;

  return (
    <div className={`${CARD} space-y-4`}>
      <h3 className="font-bold text-lg flex items-center gap-2">
        <Drop weight="fill" className="w-5 h-5 text-cyan-400" /> Purchase Steam Access
      </h3>
      <div className="bg-zinc-800/50 border border-zinc-700/60 rounded-xl p-4 space-y-2.5 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-zinc-400">Single Session</span>
          <span className="font-bold text-white">{formatETB(singlePrice)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-zinc-400">{packageVisits}-Visit Package</span>
          <span className="font-bold text-cyan-400">{formatETB(packagePrice)}</span>
        </div>
      </div>
      <div className="p-4 bg-cyan-950/40 border border-cyan-800/50 rounded-xl text-xs text-cyan-200 space-y-1">
        <div className="font-bold text-sm text-cyan-300">Purchase at Reception</div>
        <p className="text-zinc-300">
          Visit the gym reception to purchase a Steam Day Pass or Visit Package. Reception accepts Cash, CBE Birr, and Telebirr.
        </p>
      </div>
    </div>
  );
}

export function SteamActiveBadge({ memberId }: { memberId: string }) {
  const { state } = useGym();
  const access = activeSteamAccess(state, memberId);
  if (!access) return null;
  const status = computeSteamStatus(access, state.settings);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-cyan-400/15 text-cyan-400">
      <Drop weight="fill" className="w-3 h-3" /> Steam {access.remainingVisits}
      {status === "Expiring Soon" && <CheckCircle weight="fill" className="w-3 h-3 text-yellow-400" />}
    </span>
  );
}
