import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Coins, TrendUp, Receipt, Gear, Plus, X, MagnifyingGlass, User, ShieldCheck, Drop } from "@phosphor-icons/react";
import LockersManagement from "./LockersManagement";
import SteamManagement from "./SteamManagement";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useGym, useT, formatETB, addAudit } from "../context/GymContext";
import { toast } from "sonner";
import { CategoriesView } from "./CategoryManagement";
import { PlansView } from "./PlansView";
import { CustomersView, FinancesView } from "./AdminCustomers";
import { ReportsView } from "./AdminReports";
import { useDashboardStats } from "../hooks/use-dashboard-stats";
import { useDashboardSupplementalData } from "../hooks/use-dashboard-supplemental-data";

const TABS = ["dashboard", "customers", "categories", "plans", "finances", "reports", "steam", "lockers", "settings"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  dashboard: "admin.tab.dashboard",
  customers: "admin.tab.customers",
  categories: "admin.tab.categories",
  plans: "admin.tab.plans",
  finances: "admin.tab.finances",
  reports: "admin.tab.reports",
  steam: "Steam / Sauna",
  lockers: "admin.tab.lockers",
  settings: "admin.tab.settings",
};

export const INPUT = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50";
export const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-6";
export const CHART_TOOLTIP = { background: "#18181b", border: "1px solid #27272a", borderRadius: 8 };
export const METHOD_LABELS: Record<string, string> = { telebirr: "Telebirr", cbe_birr: "CBE Birr", cash: "Cash", card: "Card" };

export default function AdminPortal() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <ShieldCheck weight="fill" className="w-6 h-6 text-lime-400" />
          <h1 className="text-2xl font-black uppercase tracking-tight">{t("admin.title")}</h1>
        </div>
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {TABS.map(key => (
            <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${tab === key ? "bg-lime-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>{t(TAB_LABEL[key])}</button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {tab === "dashboard" && <DashboardView />}
            {tab === "customers" && <CustomersView />}
            {tab === "categories" && <CategoriesView />}
            {tab === "plans" && <PlansView />}
            {tab === "finances" && <FinancesView />}
            {tab === "reports" && <ReportsView />}
            {tab === "steam" && <SteamManagement canManageServices />}
            {tab === "lockers" && <LockersManagement canManage />}
            {tab === "settings" && <SettingsView />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function DashboardView() {
  const { state } = useGym();
  const { stats, isLoading, error, refresh } = useDashboardStats();
  const supplemental = useDashboardSupplementalData();
  const totalRevenue = stats?.totalRevenue ?? 0;
  const totalExpenses = stats?.totalExpense ?? 0;
  const netResult = stats?.netResult ?? 0;
  const activeMembers = stats?.activeMembers ?? 0;
  const expiringMembers = stats?.expiringMembers ?? 0;
  const expiredMembers = stats?.expiredMembers ?? 0;
  const steamRevenue = supplemental.steam?.revenue ?? 0;
  const activeSteam = supplemental.steam?.activePasses ?? 0;

  const kpis = [
    { label: "Total revenue", value: formatETB(totalRevenue), icon: Coins, color: "text-lime-400" },
    { label: "Total expenses", value: formatETB(totalExpenses), icon: Receipt, color: "text-red-400" },
    { label: "Net result", value: formatETB(netResult), icon: TrendUp, color: netResult >= 0 ? "text-lime-400" : "text-red-400" },
    { label: "Active members", value: String(activeMembers), icon: Users, color: "text-blue-400" },
  ];
  const displayKpiValue = (value: string) => isLoading ? "..." : error ? "—" : value;

  return (
    <div className="space-y-8">
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <button onClick={() => void refresh()} className="font-semibold text-red-300 hover:text-white">Retry</button>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className={CARD}>
            <kpi.icon weight="fill" className={`w-8 h-8 ${kpi.color} mb-3`} />
            <div className="text-2xl font-black">{displayKpiValue(kpi.value)}</div>
            <div className="text-sm text-zinc-500">{kpi.label}</div>
          </motion.div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${CARD} text-center`}><div className="text-3xl font-black text-lime-400">{displayKpiValue(String(activeMembers))}</div><div className="text-sm text-zinc-400 mt-1">Active</div></div>
        <div className={`${CARD} text-center`}><div className="text-3xl font-black text-yellow-400">{displayKpiValue(String(expiringMembers))}</div><div className="text-sm text-zinc-400 mt-1">Expiring soon</div></div>
        <div className={`${CARD} text-center`}><div className="text-3xl font-black text-red-400">{displayKpiValue(String(expiredMembers))}</div><div className="text-sm text-zinc-400 mt-1">Expired</div></div>
      </div>
      {state.settings.steamEnabled && (
        <div className={CARD}>
          <h3 className="font-bold mb-4 flex items-center gap-2"><Drop weight="fill" className="w-5 h-5 text-cyan-400" /> Steam module</h3>
          {supplemental.error && <div className="mb-4 text-sm text-red-300">{supplemental.error} <button onClick={() => void supplemental.refresh()} className="font-semibold hover:text-white">Retry</button></div>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-zinc-800/50 rounded-2xl p-4"><div className="text-2xl font-black text-cyan-400">{supplemental.isLoading ? "..." : supplemental.error ? "—" : activeSteam}</div><div className="text-xs text-zinc-500">Active Steam passes</div></div>
            <div className="bg-zinc-800/50 rounded-2xl p-4"><div className="text-2xl font-black text-lime-400">{supplemental.isLoading ? "..." : supplemental.error ? "—" : formatETB(steamRevenue)}</div><div className="text-xs text-zinc-500">Steam revenue</div></div>
            <div className="bg-zinc-800/50 rounded-2xl p-4"><div className="text-2xl font-black text-white">{supplemental.isLoading ? "..." : supplemental.error ? "—" : supplemental.steam?.recentEntries ?? 0}</div><div className="text-xs text-zinc-500">Recent Steam entries</div></div>
          </div>
        </div>
      )}
      <div className={CARD}>
        <h3 className="font-bold mb-4">Member breakdown by customer category</h3>
        {supplemental.error && <div className="mb-4 text-sm text-red-300">{supplemental.error} <button onClick={() => void supplemental.refresh()} className="font-semibold hover:text-white">Retry</button></div>}
        {supplemental.isLoading && <div className="text-sm text-zinc-500">Loading member categories...</div>}
        {!supplemental.isLoading && !supplemental.error && supplemental.categoryBreakdown?.length === 0 && <div className="text-sm text-zinc-500">No member category data available.</div>}
        {!supplemental.isLoading && !supplemental.error && supplemental.categoryBreakdown && <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {supplemental.categoryBreakdown.map(item => {
            return (
              <div key={item.planName} className="bg-zinc-800/50 rounded-2xl p-4">
                <div className="text-sm font-semibold">{item.planName}</div>
                <div className="text-2xl font-black text-lime-400">{item.memberCount}</div>
                <div className="text-xs text-zinc-500">{formatETB(item.revenue)} in revenue</div>
              </div>
            );
          })}
        </div>}
      </div>
      <div className={CARD}>
        <h3 className="font-bold mb-4">Revenue vs expenses (monthly)</h3>
        {supplemental.isLoading && <div className="h-[280px] flex items-center justify-center text-sm text-zinc-500">Loading financial trend...</div>}
        {!supplemental.isLoading && supplemental.trendError && <div className="h-[280px] flex flex-col items-center justify-center gap-2 text-sm text-red-300"><span>{supplemental.trendError}</span><button onClick={() => void supplemental.refresh()} className="font-semibold hover:text-white">Retry</button></div>}
        {!supplemental.isLoading && !supplemental.trendError && supplemental.financialTrend?.length === 0 && <div className="h-[280px] flex items-center justify-center text-sm text-zinc-500">No revenue or expense data available.</div>}
        {!supplemental.isLoading && !supplemental.trendError && supplemental.financialTrend && supplemental.financialTrend.length > 0 && <ResponsiveContainer width="100%" height={280}>
          <LineChart data={supplemental.financialTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
            <YAxis stroke="#71717a" fontSize={12} />
            <Tooltip contentStyle={CHART_TOOLTIP} />
            <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#a3e635" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="expenses" name="Expense" stroke="#ef4444" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>}
      </div>
    </div>
  );
}

function SettingsView() {
  const { state, dispatch } = useGym();
  const [settings, setSettings] = useState({ ...state.settings });

  const saveSettings = () => {
    dispatch({ type: "UPDATE_SETTINGS", payload: settings });
    addAudit(dispatch, "Settings updated", state.currentUser?.name || "Owner", "Gym settings changed");
    toast.success("Settings saved");
  };

  const fields: { key: keyof typeof settings; label: string; type?: string }[] = [
    { key: "gymName", label: "Gym name" },
    { key: "tagline", label: "Tagline" },
    { key: "email", label: "E-mail" },
    { key: "phone", label: "Phone" },
    { key: "address", label: "Address" },
    { key: "inactivityThresholdDays", label: "Inactivity threshold (days)", type: "number" },
  ];

  return (
    <div className="space-y-6">
      <div className={CARD}>
        <h3 className="font-bold mb-4 flex items-center gap-2"><Gear className="w-5 h-5 text-lime-400" /> Gym information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map(f => (
            <div key={String(f.key)}>
              <label className="text-xs text-zinc-500 block mb-1">{f.label}</label>
              <input
                type={f.type || "text"}
                value={String(settings[f.key] ?? "")}
                onChange={e => setSettings({ ...settings, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })}
                className={INPUT}
              />
            </div>
          ))}
        </div>
        <button onClick={saveSettings} className="mt-4 bg-lime-400 text-zinc-950 px-6 py-2.5 rounded-xl font-bold hover:bg-lime-300">Save settings</button>
      </div>
      <div className={CARD}>
        <h3 className="font-bold mb-4 flex items-center gap-2"><Drop weight="fill" className="w-5 h-5 text-cyan-400" /> Steam configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={settings.steamEnabled} onChange={e => setSettings({ ...settings, steamEnabled: e.target.checked })} className="w-5 h-5 accent-cyan-400" />
            <span className="text-sm">Enable the Steam module</span>
          </label>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Sales model</label>
            <select value={settings.steamModel} onChange={e => setSettings({ ...settings, steamModel: e.target.value as typeof settings.steamModel })} className={INPUT}>
              <option value="package">Package only</option>
              <option value="per_visit">Single session</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div><label className="text-xs text-zinc-500 block mb-1">Package price (ETB)</label><input type="number" value={settings.steamPackagePrice} onChange={e => setSettings({ ...settings, steamPackagePrice: Number(e.target.value) })} className={INPUT} /></div>
          <div><label className="text-xs text-zinc-500 block mb-1">Sessions per package</label><input type="number" value={settings.steamPackageVisits} onChange={e => setSettings({ ...settings, steamPackageVisits: Number(e.target.value) })} className={INPUT} /></div>
          <div><label className="text-xs text-zinc-500 block mb-1">Package validity (days)</label><input type="number" value={settings.steamPackageDays} onChange={e => setSettings({ ...settings, steamPackageDays: Number(e.target.value) })} className={INPUT} /></div>
          <div><label className="text-xs text-zinc-500 block mb-1">Single session price (ETB)</label><input type="number" value={settings.steamPerVisitPrice} onChange={e => setSettings({ ...settings, steamPerVisitPrice: Number(e.target.value) })} className={INPUT} /></div>
          <div><label className="text-xs text-zinc-500 block mb-1">Expiry alert (days)</label><input type="number" value={settings.steamExpiringSoonDays} onChange={e => setSettings({ ...settings, steamExpiringSoonDays: Number(e.target.value) })} className={INPUT} /></div>
        </div>
      </div>
      <div className={CARD}>
        <h3 className="font-bold mb-4">Staff accounts</h3>
        <div className="space-y-3">
          {state.staff.map(s => (
            <div key={s.id} className="flex items-center justify-between bg-zinc-800/50 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3"><User className="w-5 h-5 text-zinc-400" /><div><div className="font-semibold text-sm">{s.name}</div><div className="text-xs text-zinc-500">{s.email}</div></div></div>
              <span className={`text-xs px-2 py-1 rounded-full ${s.role === "owner" ? "bg-lime-400/20 text-lime-400" : "bg-blue-400/20 text-blue-400"}`}>{s.role === "owner" ? "Owner" : s.role === "staff" ? "Reception" : s.role === "trainer" ? "Coach" : "Member"}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={CARD}>
        <h3 className="font-bold mb-4">Audit log</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {state.auditLogs.slice().reverse().map(a => (
            <div key={a.id} className="text-sm border-l-2 border-zinc-700 pl-3 py-1">
              <div className="font-semibold">{a.action}</div>
              <div className="text-zinc-500 text-xs">{a.details} · {a.actor} on {new Date(a.timestamp).toLocaleString("en-US")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
