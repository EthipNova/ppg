import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Coins,
  TrendUp,
  Receipt,
  Gear,
  ShieldCheck,
  Drop,
  Key,
  Lock,
  CheckCircle,
  Eye,
  EyeSlash,
  CaretDown,
  ArrowClockwise,
  Image as ImageIcon,
  UploadSimple,
  Trash,
  Star,
  Check,
} from "@phosphor-icons/react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useGym, useT, formatETB, addAudit } from "../context/GymContext";
import { toast } from "sonner";
import { CustomersView } from "./AdminCustomers";
import AdminStaffManagement from "./AdminStaffManagement";
import AdminTrainerManagement from "./AdminTrainerManagement";
import AdminCategoriesPlans from "./AdminCategoriesPlans";
import AdminFinancesReports from "./AdminFinancesReports";
import AdminFacilitiesManagement from "./AdminFacilitiesManagement";
import { useDashboardStats } from "../hooks/use-dashboard-stats";
import { useDashboardSupplementalData } from "../hooks/use-dashboard-supplemental-data";
import { fetchGymSettings, updateGymSettings } from "../services/gymSettingsService";
import { changeCurrentUserPassword } from "../services/auth";
import {
  fetchWebsiteMedia,
  uploadWebsiteMediaImage,
  saveWebsiteMediaItem,
  setActiveWebsiteMedia,
  deleteWebsiteMediaItem,
  WebsiteMediaItem,
} from "../services/websiteMediaService";

const TABS = [
  "dashboard",
  "customers",
  "trainers",
  "staff",
  "categories_plans",
  "finances_reports",
  "facilities",
  "settings",
] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  dashboard: "admin.tab.dashboard",
  customers: "admin.tab.customers",
  trainers: "admin.tab.trainers",
  staff: "admin.tab.staff",
  categories_plans: "admin.tab.categories_plans",
  finances_reports: "admin.tab.finances_reports",
  facilities: "admin.tab.facilities",
  settings: "admin.tab.settings",
};

const TAB_TO_SLUG: Record<Tab, string> = {
  dashboard: "dashboard",
  customers: "customers",
  trainers: "trainers",
  staff: "staff",
  categories_plans: "categories-plans",
  finances_reports: "finances-reports",
  facilities: "facilities",
  settings: "settings",
};

const SLUG_TO_TAB: Record<string, Tab> = {
  dashboard: "dashboard",
  customers: "customers",
  trainers: "trainers",
  staff: "staff",
  "categories-plans": "categories_plans",
  categories_plans: "categories_plans",
  "finances-reports": "finances_reports",
  finances_reports: "finances_reports",
  facilities: "facilities",
  settings: "settings",
};

const INPUT = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50";
const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-6";
const CHART_TOOLTIP = { background: "#18181b", border: "1px solid #27272a", borderRadius: 8 };

export default function AdminPortal() {
  const t = useT();
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const tab: Tab = (section && SLUG_TO_TAB[section.toLowerCase()]) || "dashboard";

  const handleTabChange = (nextTab: Tab) => {
    navigate(`/admin/${TAB_TO_SLUG[nextTab]}`);
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <ShieldCheck weight="fill" className="w-6 h-6 text-lime-400" />
          <h1 className="text-2xl font-black uppercase tracking-tight">{t("admin.title")}</h1>
        </div>
        {/* Mobile Navigation Dropdown for small screens */}
        <div className="md:hidden mb-6">
          <label className="text-xs text-zinc-400 block mb-1.5 font-semibold">Admin Workspace Section:</label>
          <div className="relative">
            <select
              value={tab}
              onChange={e => handleTabChange(e.target.value as Tab)}
              className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-lime-400 appearance-none pr-10 cursor-pointer"
            >
              {TABS.map(key => (
                <option key={key} value={key} className="bg-zinc-900 text-white">
                  {t(TAB_LABEL[key])}
                </option>
              ))}
            </select>
            <CaretDown weight="bold" className="w-4 h-4 text-zinc-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Desktop Tabs */}
        <div className="hidden md:flex gap-2 mb-8 overflow-x-auto pb-2">
          {TABS.map(key => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                tab === key ? "bg-lime-400 text-zinc-950 font-bold shadow-md shadow-lime-400/20" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {t(TAB_LABEL[key])}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {tab === "dashboard" && <DashboardView />}
            {tab === "customers" && <CustomersView />}
            {tab === "trainers" && <AdminTrainerManagement />}
            {tab === "staff" && <AdminStaffManagement />}
            {tab === "categories_plans" && <AdminCategoriesPlans />}
            {tab === "finances_reports" && <AdminFinancesReports />}
            {tab === "facilities" && <AdminFacilitiesManagement />}
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
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className={CARD}>
            <kpi.icon weight="fill" className={`w-8 h-8 ${kpi.color} mb-3`} />
            <div className="text-2xl font-black">{displayKpiValue(kpi.value)}</div>
            <div className="text-sm text-zinc-500">{kpi.label}</div>
          </motion.div>
        ))}
      </div>
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 gap-4">
        <div className={`${CARD} text-center`}><div className="text-3xl font-black text-lime-400">{displayKpiValue(String(activeMembers))}</div><div className="text-sm text-zinc-400 mt-1">Active</div></div>
        <div className={`${CARD} text-center`}><div className="text-3xl font-black text-yellow-400">{displayKpiValue(String(expiringMembers))}</div><div className="text-sm text-zinc-400 mt-1">Expiring soon</div></div>
        <div className={`${CARD} text-center`}><div className="text-3xl font-black text-red-400">{displayKpiValue(String(expiredMembers))}</div><div className="text-sm text-zinc-400 mt-1">Expired</div></div>
      </div>
      {state.settings.steamEnabled && (
        <div className={CARD}>
          <h3 className="font-bold mb-4 flex items-center gap-2"><Drop weight="fill" className="w-5 h-5 text-cyan-400" /> Steam module</h3>
          {supplemental.error && <div className="mb-4 text-sm text-red-300">{supplemental.error} <button onClick={() => void supplemental.refresh()} className="font-semibold hover:text-white">Retry</button></div>}
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 gap-4">
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

function PublicWebsiteMediaSection() {
  const { state, dispatch } = useGym();
  const [mediaItems, setMediaItems] = useState<WebsiteMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Upload form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMedia = async () => {
    setIsLoading(true);
    try {
      const items = await fetchWebsiteMedia("where_the_work_happens");
      setMediaItems(items);
    } catch (err) {
      console.warn("Failed to load website media:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMedia();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file (PNG, JPG, WEBP).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image file size must be under 10MB.");
      return;
    }
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    if (!title) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error("Please choose an image file to upload.");
      return;
    }
    setIsUploading(true);
    try {
      const { publicUrl, storagePath } = await uploadWebsiteMediaImage(selectedFile);
      await saveWebsiteMediaItem({
        section: "where_the_work_happens",
        title: title.trim() || "Gym Showcase Image",
        imageUrl: publicUrl,
        storagePath,
        isActive: true, // Automatically set newly uploaded image as live
      });
      addAudit(
        dispatch,
        "Website media uploaded",
        state.currentUser?.name || "Admin",
        `Uploaded & activated showcase image: ${title || "Showcase"}`
      );
      toast.success("Showcase image uploaded and activated on public website!");
      // Reset form
      setSelectedFile(null);
      setFilePreview(null);
      setTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadMedia();
    } catch (err: unknown) {
      console.error("Upload media error:", err);
      toast.error((err as Error)?.message || "Failed to upload image.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSetActive = async (item: WebsiteMediaItem) => {
    if (item.isActive) return;
    setActionInProgressId(item.id);
    try {
      await setActiveWebsiteMedia(item.id, "where_the_work_happens");
      addAudit(
        dispatch,
        "Active website media updated",
        state.currentUser?.name || "Admin",
        `Set "${item.title}" as active showcase image`
      );
      toast.success(`"${item.title}" is now active on the public website!`);
      await loadMedia();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to activate image.");
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleDelete = async (item: WebsiteMediaItem) => {
    if (!window.confirm(`Are you sure you want to delete "${item.title}"?`)) {
      return;
    }
    setActionInProgressId(item.id);
    try {
      await deleteWebsiteMediaItem(item.id, item.storagePath);
      addAudit(
        dispatch,
        "Website media deleted",
        state.currentUser?.name || "Admin",
        `Deleted showcase image: ${item.title}`
      );
      toast.success("Image removed.");
      await loadMedia();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to delete image.");
    } finally {
      setActionInProgressId(null);
    }
  };

  const activeItem = mediaItems.find((i) => i.isActive);

  return (
    <div className={CARD}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-4 mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center text-lime-400 shrink-0">
            <ImageIcon weight="fill" className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-white">Public Website Media</h3>
            <p className="text-xs text-zinc-400">
              Manage showcase imagery for &ldquo;Inside the Club – Where the Work Happens&rdquo; on the public landing page.
            </p>
          </div>
        </div>
        {isLoading && (
          <span className="text-xs text-zinc-400 flex items-center gap-1.5 self-start sm:self-auto">
            <ArrowClockwise weight="bold" className="w-3.5 h-3.5 animate-spin text-lime-400" />
            Syncing media...
          </span>
        )}
      </div>

      {/* Currently Active Live Preview */}
      <div className="mb-6 p-4 rounded-xl bg-zinc-950/70 border border-zinc-800">
        <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center justify-between">
          <span>Currently Live on Public Website</span>
          {activeItem ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-lime-400/10 border border-lime-400/30 text-lime-400">
              <Check weight="bold" className="w-3 h-3" />
              Custom Active Image
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800 text-zinc-400">
              Default Local Image (gebeya.webp)
            </span>
          )}
        </div>

        <div className="relative aspect-[16/7] w-full max-h-64 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900 flex items-center justify-center">
          <img
            src={activeItem ? activeItem.imageUrl : "/gebeya.webp"}
            alt={activeItem ? activeItem.title : "Default gym showcase"}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-4">
            <span className="text-xs font-mono uppercase text-lime-400 font-bold tracking-widest">
              Where the Work Happens
            </span>
            <h4 className="text-white font-bold text-base sm:text-lg">
              {activeItem ? activeItem.title : "PowerPlus Main Gym Floor (Default)"}
            </h4>
          </div>
        </div>
      </div>

      {/* Upload New Showcase Image Form */}
      <form onSubmit={handleUpload} className="mb-6 p-4 rounded-xl bg-zinc-800/40 border border-zinc-700/60 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <UploadSimple weight="bold" className="w-4 h-4 text-lime-400" />
          <span>Upload New Showcase Image</span>
        </div>

        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
              Image Title / Area Description <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Free Weights Zone, Cardio Deck"
              className={INPUT}
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
              Image File <span className="text-red-400">*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/jpg"
              onChange={handleFileChange}
              className={`${INPUT} text-xs file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-lime-400 file:text-zinc-950 hover:file:bg-lime-300 cursor-pointer`}
              required
            />
          </div>
        </div>

        {filePreview && (
          <div className="flex items-center gap-4 p-3 bg-zinc-900 rounded-xl border border-zinc-800">
            <img
              src={filePreview}
              alt="Upload preview"
              className="w-16 h-12 object-cover rounded-lg border border-zinc-700 shrink-0"
            />
            <div className="text-xs text-zinc-400 overflow-hidden">
              <span className="font-semibold text-white block truncate">
                {selectedFile?.name}
              </span>
              <span>{(Number(selectedFile?.size || 0) / (1024 * 1024)).toFixed(2)} MB preview ready</span>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isUploading || !selectedFile}
            className="bg-lime-400 text-zinc-950 px-5 py-2.5 rounded-xl font-bold hover:bg-lime-300 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer active:scale-95"
          >
            {isUploading ? (
              <>
                <ArrowClockwise weight="bold" className="w-4 h-4 animate-spin" />
                Uploading to Supabase...
              </>
            ) : (
              <>
                <UploadSimple weight="bold" className="w-4 h-4" />
                Upload & Set Active
              </>
            )}
          </button>
        </div>
      </form>

      {/* Available Uploaded Images Gallery */}
      <div>
        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
          Uploaded Showcase Images ({mediaItems.length})
        </h4>

        {mediaItems.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-xl border border-dashed border-zinc-800 text-zinc-500 text-xs">
            No custom showcase images uploaded yet. The landing page is currently displaying the default local asset.
          </div>
        ) : (
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 gap-4">
            {mediaItems.map((item) => {
              const isActioning = actionInProgressId === item.id;
              return (
                <div
                  key={item.id}
                  className={`relative rounded-xl border overflow-hidden flex flex-col justify-between transition-all ${
                    item.isActive
                      ? "border-lime-400/50 bg-lime-400/[0.03] ring-1 ring-lime-400/30"
                      : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
                  }`}
                >
                  <div className="relative aspect-[16/9] w-full bg-zinc-950 overflow-hidden">
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {item.isActive && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-lime-400 text-zinc-950 shadow-md flex items-center gap-1">
                        <Check weight="bold" className="w-3 h-3" />
                        Active on Website
                      </span>
                    )}
                  </div>

                  <div className="p-3.5 flex flex-col justify-between flex-1 gap-3">
                    <div>
                      <h5 className="font-bold text-sm text-white line-clamp-1">{item.title}</h5>
                      <span className="text-[11px] text-zinc-500">
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "Uploaded"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-800/80">
                      {!item.isActive ? (
                        <button
                          type="button"
                          onClick={() => handleSetActive(item)}
                          disabled={isActioning}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {isActioning ? (
                            <ArrowClockwise weight="bold" className="w-3.5 h-3.5 animate-spin text-lime-400" />
                          ) : (
                            <Star weight="bold" className="w-3.5 h-3.5 text-lime-400" />
                          )}
                          Set Active
                        </button>
                      ) : (
                        <span className="text-xs text-lime-400 font-bold flex items-center gap-1">
                          <Check weight="bold" className="w-3.5 h-3.5" />
                          Currently Live
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={isActioning}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50 cursor-pointer ml-auto"
                        title="Delete image"
                      >
                        <Trash weight="bold" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsView() {
  const { state, dispatch } = useGym();
  const [settings, setSettings] = useState({ ...state.settings });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  // Sync settings when state changes
  useEffect(() => {
    setSettings({ ...state.settings });
  }, [state.settings]);

  // Load freshest settings from Supabase on mount
  useEffect(() => {
    let active = true;
    async function loadFresh() {
      setIsLoading(true);
      try {
        const fresh = await fetchGymSettings();
        if (active && fresh) {
          setSettings(fresh);
          dispatch({ type: "UPDATE_SETTINGS", payload: fresh });
        }
      } catch (err) {
        console.warn("Failed to load settings from Supabase:", err);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void loadFresh();
    return () => { active = false; };
  }, [dispatch]);

  const handleSaveGymInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings.gymName.trim()) {
      toast.error("Gym name cannot be empty.");
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateGymSettings(settings);
      dispatch({ type: "UPDATE_SETTINGS", payload: updated });
      addAudit(dispatch, "Gym information updated", state.currentUser?.name || "Owner", "Gym settings saved to database");
      toast.success("Gym information saved successfully to database!");
    } catch (err: unknown) {
      console.error("Save gym settings error:", err);
      toast.error((err as Error)?.message || "Failed to save gym settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setIsChangingPassword(true);
    try {
      await changeCurrentUserPassword(currentPassword, newPassword);
      setPasswordSuccess("Your admin password has been changed successfully.");
      toast.success("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to change password. Please check your current password.";
      setPasswordError(msg);
      toast.error(msg);
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Database-Connected Gym Information Section */}
      <div className={CARD}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-4 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center text-lime-400 shrink-0">
              <Gear weight="fill" className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Gym Information</h3>
              <p className="text-xs text-zinc-400">
                Connected directly to Supabase. Updates automatically display on public website & member portals.
              </p>
            </div>
          </div>
          {isLoading && (
            <span className="text-xs text-zinc-400 flex items-center gap-1.5 self-start sm:self-auto">
              <ArrowClockwise weight="bold" className="w-3.5 h-3.5 animate-spin text-lime-400" />
              Syncing from database...
            </span>
          )}
        </div>

        <form onSubmit={handleSaveGymInfo} className="space-y-4">
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
                Gym Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={settings.gymName}
                onChange={e => setSettings({ ...settings, gymName: e.target.value })}
                className={INPUT}
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
                Brand Tagline
              </label>
              <input
                type="text"
                value={settings.tagline || ""}
                onChange={e => setSettings({ ...settings, tagline: e.target.value })}
                className={INPUT}
                placeholder="e.g. Train hard. Stay strong."
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
                Public Description
              </label>
              <textarea
                rows={2}
                value={settings.description || ""}
                onChange={e => setSettings({ ...settings, description: e.target.value })}
                className={`${INPUT} resize-none`}
                placeholder="Brief description of PowerPlus Gym"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
                Contact Phone
              </label>
              <input
                type="text"
                value={settings.phone || ""}
                onChange={e => setSettings({ ...settings, phone: e.target.value })}
                className={INPUT}
                placeholder="+251 911 234 567"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
                Contact Email
              </label>
              <input
                type="email"
                value={settings.email || ""}
                onChange={e => setSettings({ ...settings, email: e.target.value })}
                className={INPUT}
                placeholder="info@powerplus.et"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
                Gym Location / Address
              </label>
              <input
                type="text"
                value={settings.address || ""}
                onChange={e => setSettings({ ...settings, address: e.target.value })}
                className={INPUT}
                placeholder="e.g. Bole Road, Addis Ababa, Ethiopia"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
                Operating Hours
              </label>
              <input
                type="text"
                value={settings.operatingHours || ""}
                onChange={e => setSettings({ ...settings, operatingHours: e.target.value })}
                className={INPUT}
                placeholder="Monday to Saturday: 05:00 AM – 11:00 PM | Sunday: 06:00 AM – 09:00 PM"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">
              Changes are saved immediately to Supabase and synchronized with the public website.
            </span>
            <button
              type="submit"
              disabled={isSaving}
              className="bg-lime-400 text-zinc-950 px-6 py-3 rounded-xl font-bold hover:bg-lime-300 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-60 cursor-pointer active:scale-95"
            >
              {isSaving ? (
                <>
                  <ArrowClockwise weight="bold" className="w-4 h-4 animate-spin" />
                  Saving to database...
                </>
              ) : (
                <>
                  <CheckCircle weight="bold" className="w-4 h-4" />
                  Save Gym Information
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 2. Public Website Media Section */}
      <PublicWebsiteMediaSection />

      {/* 3. Admin Secure Change Password Section */}
      <div className={CARD}>
        <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center text-lime-400 shrink-0">
            <Key weight="fill" className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-white">Change Admin Password</h3>
            <p className="text-xs text-zinc-400">
              Update your personal credentials securely via Supabase Authentication.
            </p>
          </div>
        </div>

        {passwordError && (
          <div className="mb-4 p-3.5 bg-red-950/80 border border-red-800/60 rounded-xl text-xs text-red-200">
            {passwordError}
          </div>
        )}

        {passwordSuccess && (
          <div className="mb-4 p-3.5 bg-emerald-950/80 border border-emerald-800/60 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle weight="fill" className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{passwordSuccess}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-xl">
          <div>
            <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
              Current Password <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className={`${INPUT} pr-10`}
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
              >
                {showCurrentPassword ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
                New Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className={`${INPUT} pr-10`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                >
                  {showNewPassword ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
                Confirm New Password <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className={INPUT}
                required
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">
              Only updates the password of the currently logged-in Admin.
            </span>
            <button
              type="submit"
              disabled={isChangingPassword}
              className="bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 px-6 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-60 cursor-pointer active:scale-95"
            >
              {isChangingPassword ? (
                <>
                  <ArrowClockwise weight="bold" className="w-4 h-4 animate-spin text-lime-400" />
                  Verifying & Updating...
                </>
              ) : (
                <>
                  <Lock weight="bold" className="w-4 h-4 text-lime-400" />
                  Update Password
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
