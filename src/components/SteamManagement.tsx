import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Drop,
  CheckCircle,
  ClockCounterClockwise,
  ArrowClockwise,
  MagnifyingGlass,
  Plus,
  User,
  ShieldCheck,
  Eye,
  Camera,
  X,
  Sparkle,
  Coins,
  Receipt,
  FloppyDisk,
  Lock,
  PencilSimple,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { formatETB, useGym } from "../context/GymContext";
import {
  searchCustomersForSteam,
  fetchActiveSteamService,
  fetchSteamSummaryStats,
  getEATPeriodRange,
  fetchSteamServicesList,
  registerSteamService,
  authorizeSteamAccess,
  completeSteamService,
  getSteamProofSignedUrl,
  saveSteamServiceConfig,
  deleteSteamServiceConfig,
  type SteamCustomerOption,
  type SteamServiceOffering,
  type SteamServiceRecord,
  type SteamSummaryStats,
} from "../services/steamOperations";

const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400 focus:outline-none transition-colors";

type TabKey = "pricing" | "new" | "history";

export default function SteamManagement({
  isAdmin,
}: {
  canManageServices?: boolean;
  isAdmin?: boolean;
}) {
  const { state } = useGym();
  const roleStr = (state.currentUser?.role || "").toLowerCase();
  const isUserAdmin = isAdmin ?? (roleStr === "owner" || roleStr === "admin");
  const [activeTab, setActiveTab] = useState<TabKey>(isUserAdmin ? "pricing" : "new");

  // Steam Statistics Filter State (Today, This Week, This Month, This Year, Custom)
  type StatsPeriod = "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "THIS_YEAR" | "CUSTOM";
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("TODAY");
  const [customStatsStart, setCustomStatsStart] = useState<string>("");
  const [customStatsEnd, setCustomStatsEnd] = useState<string>("");
  const [statsLoading, setStatsLoading] = useState<boolean>(false);

  const [stats, setStats] = useState<SteamSummaryStats>({
    services_count: 0,
    today_services: 0,
    pending_payments: 0,
    approved_payments: 0,
    in_progress_services: 0,
    completed_services: 0,
    revenue: 0,
    today_revenue: 0,
  });
  const [records, setRecords] = useState<SteamServiceRecord[]>([]);
  const [activeOffering, setActiveOffering] = useState<SteamServiceOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Steam Service Configuration State for Admin (Single Service Architecture)
  const [isConfiguringPrice, setIsConfiguringPrice] = useState<boolean>(false);
  const [configPriceInput, setConfigPriceInput] = useState<string>("");
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [isDeletingConfig, setIsDeletingConfig] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);

  // Form State for Reception "New Steam Service"
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOptions, setCustomerOptions] = useState<SteamCustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<SteamCustomerOption | null>(null);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("TELEBIRR");
  const [paymentReference, setPaymentReference] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [authorizeImmediately, setAuthorizeImmediately] = useState<boolean>(true);

  // History Filter State (Payment Method Filter)
  const [historySearch, setHistorySearch] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("");

  // Modal State for Image Proof Viewing
  const [viewingProofUrl, setViewingProofUrl] = useState<string | null>(null);
  const [viewingProofTitle, setViewingProofTitle] = useState<string>("");
  const [loadingProof, setLoadingProof] = useState<boolean>(false);

  // Load stats specifically for selected period
  const loadPeriodStats = useCallback(async (
    period: StatsPeriod = statsPeriod,
    customStart?: string,
    customEnd?: string
  ) => {
    try {
      setStatsLoading(true);
      const { startUtc, endUtc } = getEATPeriodRange(period, customStart, customEnd);
      const nextStats = await fetchSteamSummaryStats(startUtc, endUtc);
      setStats(nextStats);
    } catch (err) {
      console.error("SteamManagement loadPeriodStats error:", err);
    } finally {
      setStatsLoading(false);
    }
  }, [statsPeriod]);

  // Load summary stats, active offering, and records
  const loadData = useCallback(async () => {
    try {
      const { startUtc, endUtc } = getEATPeriodRange(statsPeriod, customStatsStart, customStatsEnd);
      const [nextStats, currentOffering, list] = await Promise.all([
        fetchSteamSummaryStats(startUtc, endUtc),
        fetchActiveSteamService(),
        fetchSteamServicesList("ALL"),
      ]);
      setStats(nextStats);
      setActiveOffering(currentOffering);
      setRecords(list);

      if (currentOffering) {
        setConfigPriceInput(String(currentOffering.price));
      } else {
        setConfigPriceInput("");
      }
    } catch (err) {
      console.error("SteamManagement loadData error:", err);
      setError(err instanceof Error ? err.message : "Unable to load Steam service data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statsPeriod, customStatsStart, customStatsEnd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Re-fetch stats when statsPeriod changes
  const handlePeriodChange = (nextPeriod: StatsPeriod) => {
    setStatsPeriod(nextPeriod);
    if (nextPeriod !== "CUSTOM") {
      void loadPeriodStats(nextPeriod);
    }
  };

  const handleApplyCustomDates = () => {
    if (!customStatsStart || !customStatsEnd) {
      toast.error("Please select both a start date and an end date.");
      return;
    }
    void loadPeriodStats("CUSTOM", customStatsStart, customStatsEnd);
  };

  // Debounced Customer Search
  useEffect(() => {
    const q = customerSearch.trim();
    if (q.length < 2) {
      setCustomerOptions([]);
      return;
    }
    setIsSearchingCustomers(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchCustomersForSteam(q);
        setCustomerOptions(results);
      } catch (err) {
        console.error("Customer search failed:", err);
      } finally {
        setIsSearchingCustomers(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [customerSearch]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    toast.success("Steam records refreshed.");
  };

  // Proof File Change Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Please upload a valid JPEG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size exceeds 5MB limit.");
      return;
    }

    setProofFile(file);
    const objectUrl = URL.createObjectURL(file);
    setProofPreviewUrl(objectUrl);
  };

  // Save Steam Configuration Handler (Admin Only - Add or Edit single price)
  const handleSaveSteamConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = Number(configPriceInput);
    if (isNaN(priceNum) || priceNum <= 0) {
      toast.error("Please enter a valid positive price amount greater than 0.");
      return;
    }
    setIsSavingConfig(true);
    try {
      await saveSteamServiceConfig(priceNum);
      toast.success(
        activeOffering
          ? `Steam service price successfully updated to ${formatETB(priceNum)}.`
          : `Steam service successfully configured at ${formatETB(priceNum)}.`
      );
      setIsConfiguringPrice(false);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save Steam service configuration.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Delete Steam Configuration Handler (Admin Only - Deactivates service)
  const handleDeleteSteamConfig = async () => {
    setIsDeletingConfig(true);
    try {
      await deleteSteamServiceConfig();
      toast.success("Steam service configuration deleted. New registrations are now disabled.");
      setShowDeleteModal(false);
      setIsConfiguringPrice(false);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete Steam configuration.");
    } finally {
      setIsDeletingConfig(false);
    }
  };

  // Submit Registration Form (Reception Only)
  const handleSubmitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOffering) {
      toast.error("No Steam service is currently configured. Please contact the Admin.");
      return;
    }
    if (!selectedCustomer) {
      toast.error("Please search and select a registered customer.");
      return;
    }
    if (paymentMethod !== "CASH" && !proofFile) {
      toast.error("Please upload the customer's payment proof photo or screenshot.");
      return;
    }

    setSubmitting(true);
    try {
      await registerSteamService({
        customerId: selectedCustomer.id,
        serviceId: activeOffering.id,
        amount: activeOffering.price,
        paymentMethod,
        paymentReference: paymentReference.trim() || undefined,
        proofFile: paymentMethod === "CASH" ? null : proofFile,
        authorizeImmediately,
      });

      toast.success(
        authorizeImmediately
          ? `Steam service registered for ${selectedCustomer.name}! Access immediately authorized.`
          : `Steam service registered for ${selectedCustomer.name}! Ready for access.`
      );

      // Reset form
      setSelectedCustomer(null);
      setCustomerSearch("");
      setCustomerOptions([]);
      setPaymentReference("");
      setProofFile(null);
      if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
      setProofPreviewUrl(null);

      // Switch to History tab so the newly registered transaction is visible
      setActiveTab("history");
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to register Steam Service.");
    } finally {
      setSubmitting(false);
    }
  };

  // Open Proof Image Modal with authenticated signed URL
  const handleViewProof = async (record: SteamServiceRecord) => {
    setViewingProofTitle(`${record.customer_name} — ${record.service_name} (${formatETB(record.amount)})`);
    setLoadingProof(true);
    try {
      const signedUrl = await getSteamProofSignedUrl(record.payment_proof_path);
      setViewingProofUrl(signedUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load payment proof image.");
    } finally {
      setLoadingProof(false);
    }
  };

  // Reception Authorize Access directly
  const handleAuthorizeAccess = async (record: SteamServiceRecord) => {
    if (!window.confirm(`Authorize steam room access for ${record.customer_name}?`)) {
      return;
    }
    try {
      await authorizeSteamAccess(record.id);
      toast.success(`Access authorized! Please inform ${record.customer_name} they may enter the steam room.`);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authorization failed.");
    }
  };

  // Reception Mark Completed
  const handleMarkCompleted = async (record: SteamServiceRecord) => {
    if (!window.confirm(`Mark Steam usage completed for ${record.customer_name}?`)) {
      return;
    }
    try {
      await completeSteamService(record.id);
      toast.success(`Steam usage completed for ${record.customer_name}. Record preserved in History.`);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete service.");
    }
  };

  // Filtered History by Payment Method (All Methods, Telebirr, CBE Birr, Cash)
  const filteredHistory = useMemo(() => {
    return records.filter(r => {
      const query = historySearch.trim().toLowerCase();
      const matchesQuery =
        !query ||
        r.customer_name.toLowerCase().includes(query) ||
        r.customer_code.toLowerCase().includes(query) ||
        (r.customer_phone && r.customer_phone.includes(query)) ||
        (r.payment_reference && r.payment_reference.toLowerCase().includes(query)) ||
        (r.registered_by_email && r.registered_by_email.toLowerCase().includes(query));

      const normalizedMethod = (r.payment_method || "").toUpperCase().trim();
      let matchesMethod = true;
      if (paymentMethodFilter === "TELEBIRR") {
        matchesMethod = normalizedMethod === "TELEBIRR";
      } else if (paymentMethodFilter === "CBE_BIRR") {
        matchesMethod = normalizedMethod === "CBE_BIRR" || normalizedMethod === "CBE BIRR";
      } else if (paymentMethodFilter === "CASH") {
        matchesMethod = normalizedMethod === "CASH";
      }

      const dateStr = r.created_at.slice(0, 10);
      const matchesDate = !dateFilter || dateStr === dateFilter;

      return matchesQuery && matchesMethod && matchesDate;
    });
  }, [records, historySearch, paymentMethodFilter, dateFilter]);

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-400">
              <Drop weight="fill" className="h-3.5 w-3.5 text-cyan-400" />
              In-Person Paid Service
            </span>
            {isUserAdmin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-lime-400/10 px-2.5 py-0.5 text-xs font-bold text-lime-300">
                <ShieldCheck weight="fill" className="h-3.5 w-3.5" /> Admin Pricing & Audit
              </span>
            )}
          </div>
          <h2 className="mt-1 text-2xl md:text-3xl font-black tracking-tight">
            {isUserAdmin ? "Steam / Sauna Pricing & History" : "Steam Service Management"}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            {isUserAdmin
              ? "Admin manages official Steam/Sauna pricing and monitors comprehensive service records. Service operations are executed by Reception."
              : "Reception registers, authorizes access immediately, and manages completion. All records automatically stream to Admin."}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading || refreshing}
          className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          <ArrowClockwise className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </header>

      {/* Error Notice */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadData} className="font-bold underline ml-3">Retry</button>
        </div>
      )}

      {/* SUMMARY STATS & PERIOD FILTERING */}
      <section className="space-y-3">
        {/* Period Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-2.5">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {(
              [
                { id: "TODAY", label: "Today" },
                { id: "THIS_WEEK", label: "This Week" },
                { id: "THIS_MONTH", label: "This Month" },
                { id: "THIS_YEAR", label: "This Year" },
                { id: "CUSTOM", label: "Custom Range" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePeriodChange(p.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  statsPeriod === p.id
                    ? "bg-cyan-400 text-zinc-950 shadow-sm shadow-cyan-400/20"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {statsPeriod === "CUSTOM" && (
            <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800">
              <input
                type="date"
                value={customStatsStart}
                onChange={(e) => setCustomStatsStart(e.target.value)}
                className="bg-zinc-950 border border-zinc-700 text-white text-xs rounded-xl px-2.5 py-1.5 focus:border-cyan-400 focus:outline-none"
                placeholder="Start Date"
                title="Start Date"
              />
              <span className="text-zinc-500 text-xs font-bold">to</span>
              <input
                type="date"
                value={customStatsEnd}
                onChange={(e) => setCustomStatsEnd(e.target.value)}
                className="bg-zinc-950 border border-zinc-700 text-white text-xs rounded-xl px-2.5 py-1.5 focus:border-cyan-400 focus:outline-none"
                placeholder="End Date"
                title="End Date"
              />
              <button
                type="button"
                onClick={handleApplyCustomDates}
                disabled={statsLoading}
                className="px-3 py-1.5 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold text-xs rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Cards (Services & Revenue) */}
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 shadow-sm relative overflow-hidden">
            {statsLoading && (
              <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              {statsPeriod === "TODAY"
                ? "Today's Services"
                : statsPeriod === "THIS_WEEK"
                ? "Services This Week"
                : statsPeriod === "THIS_MONTH"
                ? "Services This Month"
                : statsPeriod === "THIS_YEAR"
                ? "Services This Year"
                : "Services (Custom Range)"}
            </div>
            <div className="mt-2 text-2xl font-black text-white">
              {stats.services_count ?? stats.today_services}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {statsPeriod === "TODAY"
                ? "Registered today"
                : statsPeriod === "THIS_WEEK"
                ? "Registered this week"
                : statsPeriod === "THIS_MONTH"
                ? "Registered this month"
                : statsPeriod === "THIS_YEAR"
                ? "Registered this year"
                : "Registered in custom range"}
            </div>
          </div>

          <div className="rounded-2xl border border-lime-500/30 bg-lime-500/5 p-4 shadow-sm relative overflow-hidden">
            {statsLoading && (
              <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <div className="text-[11px] font-bold uppercase tracking-wider text-lime-400">
              {statsPeriod === "TODAY"
                ? "Today's Revenue"
                : statsPeriod === "THIS_WEEK"
                ? "Revenue This Week"
                : statsPeriod === "THIS_MONTH"
                ? "Revenue This Month"
                : statsPeriod === "THIS_YEAR"
                ? "Revenue This Year"
                : "Revenue (Custom Range)"}
            </div>
            <div className="mt-2 text-2xl font-black text-lime-300">
              {formatETB(stats.revenue ?? stats.today_revenue)}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Approved payments (excl. cancelled)
            </div>
          </div>
        </div>
      </section>

      {/* NAVIGATION TABS */}
      <nav className="flex gap-2 border-b border-zinc-800 pb-3">
        {isUserAdmin ? (
          <>
            <button
              onClick={() => setActiveTab("pricing")}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
                activeTab === "pricing"
                  ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/20"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              <Coins weight="bold" className="h-4 w-4" />
              <span>Price Configuration</span>
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
                activeTab === "history"
                  ? "bg-zinc-100 text-zinc-950 shadow-md"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              <ClockCounterClockwise weight="bold" className="h-4 w-4" />
              <span>Service History</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-black ${
                  activeTab === "history" ? "bg-zinc-950 text-white" : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {records.length}
              </span>
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setActiveTab("new")}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
                activeTab === "new"
                  ? "bg-cyan-400 text-zinc-950 shadow-md shadow-cyan-400/20"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              <Plus weight="bold" className="h-4 w-4" />
              <span>New Steam Service</span>
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
                activeTab === "history"
                  ? "bg-zinc-100 text-zinc-950 shadow-md"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              <ClockCounterClockwise weight="bold" className="h-4 w-4" />
              <span>History</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-black ${
                  activeTab === "history" ? "bg-zinc-950 text-white" : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {records.length}
              </span>
            </button>
          </>
        )}
      </nav>

      {/* SECTION: ADMIN PRICE CONFIGURATION (SINGLE STEAM SERVICE ARCHITECTURE) */}
      {activeTab === "pricing" && isUserAdmin && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 space-y-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Coins weight="fill" className="h-5 w-5 text-lime-400" />
                  Steam & Sauna Service Configuration
                </h3>
                <p className="mt-1 text-xs text-zinc-400">
                  PowerPlus Gym offers a single Steam & Sauna service. Manage the official rate below.
                </p>
              </div>
              {activeOffering && !isConfiguringPrice && (
                <div className="rounded-xl border border-lime-400/30 bg-lime-400/10 px-4 py-2 text-right">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-lime-400 block">
                    Current Configured Rate
                  </span>
                  <span className="text-xl font-black text-lime-300">
                    {formatETB(activeOffering.price)}
                  </span>
                </div>
              )}
            </div>

            {/* CASE 1: When no Steam service configuration exists */}
            {!activeOffering && !isConfiguringPrice && (
              <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 p-8 text-center space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-400">
                  <WarningCircle weight="duotone" className="h-8 w-8" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">No Steam Service Configured</h4>
                  <p className="mt-1 max-w-md mx-auto text-xs text-zinc-400 leading-relaxed">
                    There is currently no active Steam/Sauna service configuration. Reception cannot register new customer Steam sessions until the service is configured.
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setConfigPriceInput("");
                      setIsConfiguringPrice(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-lime-400 px-5 py-2.5 text-sm font-bold text-zinc-950 hover:bg-lime-300 transition-colors shadow-sm"
                  >
                    <Plus weight="bold" className="h-4 w-4" />
                    <span>Add Steam</span>
                  </button>
                </div>
              </div>
            )}

            {/* CASE 2: When adding or editing the Steam configuration */}
            {isConfiguringPrice && (
              <form onSubmit={handleSaveSteamConfig} className="rounded-xl border border-lime-500/30 bg-zinc-950/70 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkle weight="fill" className="h-4 w-4 text-lime-400" />
                    {activeOffering ? "Edit Steam Service Price" : "Add Steam Service"}
                  </h4>
                  <span className="text-xs text-zinc-400">
                    {activeOffering ? "Update existing standard rate" : "Set initial service price"}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
                    Steam Service Amount (ETB) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={configPriceInput}
                    onChange={e => setConfigPriceInput(e.target.value)}
                    placeholder="Enter positive price (e.g. 150)..."
                    className={inputClass}
                    autoFocus
                    required
                  />
                  <p className="text-[11px] text-zinc-500">
                    This amount will automatically be retrieved and charged to customers at Reception.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isSavingConfig}
                    onClick={() => {
                      setIsConfiguringPrice(false);
                      setConfigPriceInput(activeOffering ? String(activeOffering.price) : "");
                    }}
                    className="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingConfig || !configPriceInput || Number(configPriceInput) <= 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-lime-400 px-5 py-2 text-xs font-bold text-zinc-950 hover:bg-lime-300 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <FloppyDisk weight="bold" className="h-4 w-4" />
                    <span>{isSavingConfig ? "Saving…" : "Save Configuration"}</span>
                  </button>
                </div>
              </form>
            )}

            {/* CASE 3: When Steam configuration already exists */}
            {activeOffering && !isConfiguringPrice && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="h-11 w-11 rounded-xl bg-cyan-400/10 flex items-center justify-center text-cyan-400 shrink-0">
                      <Drop weight="duotone" className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-base">{activeOffering.name}</span>
                        <span className="rounded-full bg-lime-400/10 px-2.5 py-0.5 text-[10px] font-bold text-lime-400">
                          Active Single Service
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">
                        Official single Steam & Sauna service. Reception automatically applies this price to all customer session passes.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right sm:pr-4 sm:border-r sm:border-zinc-800">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Current Price</div>
                      <div className="font-mono text-2xl font-black text-lime-400">
                        {formatETB(activeOffering.price)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfigPriceInput(String(activeOffering.price));
                          setIsConfiguringPrice(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-bold text-zinc-200 hover:text-white hover:bg-zinc-700 transition-colors"
                      >
                        <PencilSimple weight="bold" className="h-3.5 w-3.5 text-lime-400" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowDeleteModal(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                      >
                        <Trash weight="bold" className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DELETE STEAM SERVICE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                <Trash weight="bold" className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-white">Delete Steam Configuration?</h3>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-300 leading-relaxed space-y-2">
              <p className="font-semibold flex items-center gap-1.5 text-amber-200">
                <WarningCircle weight="bold" className="h-4 w-4 shrink-0" />
                Service Deactivation Notice
              </p>
              <p>
                Deleting this configuration will prevent new Steam registrations at Reception until the service is configured again.
              </p>
              <p className="text-[11px] text-zinc-400">
                All historical Steam transactions, payments, completed services, and customer records will remain completely preserved and intact.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingConfig}
                onClick={() => setShowDeleteModal(false)}
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingConfig}
                onClick={handleDeleteSteamConfig}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50 transition-colors shadow-sm"
              >
                <Trash weight="bold" className="h-4 w-4" />
                <span>{isDeletingConfig ? "Deleting…" : "Delete Steam Service"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 1: NEW STEAM SERVICE (RECEPTION ONLY) */}
      {activeTab === "new" && !isUserAdmin && (
        <div className="max-w-3xl space-y-6">
            {!activeOffering ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-400">
                  <WarningCircle weight="duotone" className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    No Steam service is currently configured. Please contact the Admin.
                  </h3>
                  <p className="mt-1.5 max-w-md mx-auto text-xs text-zinc-400 leading-relaxed">
                    Customer registrations for Steam & Sauna sessions are temporarily disabled because there is no active service rate set in the system. Once the Admin configures the Steam service rate, registration will automatically become available.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => void loadData()}
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
                  >
                    <ArrowClockwise weight="bold" className="h-3.5 w-3.5" />
                    <span>Check Again</span>
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmitRegistration}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 space-y-6 shadow-sm"
              >
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Drop weight="fill" className="h-5 w-5 text-cyan-400" />
                  New Steam Service
                </h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Select customer, record payment, attach payment photo, and authorize immediate steam access.
                </p>
              </div>

              {/* Step 1: Customer Search */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <User weight="bold" className="h-4 w-4 text-cyan-400" />
                  1. Customer Search (Name, Member ID, or Phone) *
                </label>
                <div className="relative">
                  <MagnifyingGlass className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={e => {
                      setCustomerSearch(e.target.value);
                      if (selectedCustomer) setSelectedCustomer(null);
                    }}
                    placeholder="Search by full name, phone number, or Member ID (e.g. PP-001)"
                    className={`${inputClass} pl-10`}
                  />
                  {isSearchingCustomers && (
                    <span className="absolute right-3.5 top-3 text-xs text-zinc-500">Searching…</span>
                  )}
                </div>

                {/* Search Results Dropdown */}
                {customerSearch.trim().length >= 2 && !selectedCustomer && (
                  <div className="rounded-xl border border-zinc-700 bg-zinc-800 max-h-56 overflow-y-auto divide-y divide-zinc-700 shadow-xl">
                    {customerOptions.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerSearch(`${c.name} (${c.code})`);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-700/60 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <div className="font-bold text-white">{c.name}</div>
                          <div className="text-xs text-zinc-400">
                            Member ID: <span className="font-mono text-cyan-300">{c.code}</span> · {c.phone || "No phone"}
                          </div>
                        </div>
                        <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-bold text-zinc-300">
                          {c.category}
                        </span>
                      </button>
                    ))}
                    {!isSearchingCustomers && customerOptions.length === 0 && (
                      <div className="p-4 text-center text-sm text-zinc-400">
                        No matching customers found. Customers must be registered members.
                      </div>
                    )}
                  </div>
                )}

                {/* Selected Customer Card */}
                {selectedCustomer && (
                  <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-cyan-400/20 flex items-center justify-center text-cyan-300 font-bold">
                        {selectedCustomer.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-white text-base">{selectedCustomer.name}</div>
                        <div className="text-xs text-zinc-300 flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
                          <span>Member ID: <strong className="font-mono text-cyan-300">{selectedCustomer.code}</strong></span>
                          <span>Phone: {selectedCustomer.phone || "—"}</span>
                          <span>Category: <strong className="text-white">{selectedCustomer.category}</strong></span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setCustomerSearch("");
                      }}
                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      title="Clear customer selection"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Step 2: Service Offering & Price */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Coins weight="bold" className="h-4 w-4 text-cyan-400" />
                  2. Steam Service Offering & Configured Price (ETB) *
                </label>
                <div className="grid gap-3 min-[420px]:grid-cols-2">
                  <div className="rounded-xl border border-zinc-700 bg-zinc-800/80 px-3.5 py-2.5 text-sm text-white flex items-center justify-between">
                    <span className="font-semibold text-zinc-200">{activeOffering?.name || "Steam / Sauna Service"}</span>
                    <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                      Standard Session
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={activeOffering?.price || ""}
                      readOnly
                      placeholder="Amount in ETB"
                      className={`${inputClass} bg-zinc-800/60 cursor-not-allowed text-lime-400 font-bold font-mono`}
                      required
                    />
                    <div className="absolute right-3 top-2.5 flex items-center gap-1.5 text-xs text-zinc-400">
                      <Lock className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="hidden sm:inline">Configured price</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3: Payment Details */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Receipt weight="bold" className="h-4 w-4 text-cyan-400" />
                  3. Payment Method & Transaction Reference *
                </label>
                <div className="grid gap-3 min-[420px]:grid-cols-2">
                  <select
                    value={paymentMethod}
                    onChange={e => {
                      const val = e.target.value;
                      setPaymentMethod(val);
                      if (val === "CASH") {
                        setProofFile(null);
                        if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
                        setProofPreviewUrl(null);
                      }
                    }}
                    className={inputClass}
                  >
                    <option value="CASH">Cash</option>
                    <option value="TELEBIRR">Telebirr</option>
                    <option value="CBE_BIRR">CBE Birr</option>
                  </select>

                  <input
                    type="text"
                    value={paymentReference}
                    onChange={e => setPaymentReference(e.target.value)}
                    placeholder="Transaction Reference / SMS Code (Optional)"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Step 4: Payment Photo Upload (Hidden for Cash, required for Telebirr / CBE Birr) */}
              {paymentMethod !== "CASH" && (
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Camera weight="bold" className="h-4 w-4 text-cyan-400" />
                    4. Payment Photo or Receipt Screenshot *
                  </label>
                  <p className="text-xs text-zinc-400">
                    Upload customer transfer confirmation for {paymentMethod === "TELEBIRR" ? "Telebirr" : "CBE Birr"}. Saved securely to private Supabase Storage.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <label className="flex w-full sm:w-auto cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-600 bg-zinc-800/80 px-5 py-3 text-sm font-semibold text-zinc-200 hover:border-cyan-400 hover:bg-zinc-800 transition-colors">
                      <Camera className="h-5 w-5 text-cyan-400" />
                      <span>{proofFile ? "Change / Retake Photo" : "Take Photo or Upload Image"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>

                    {proofFile && (
                      <span className="text-xs text-zinc-300">
                        Selected: <strong>{proofFile.name}</strong> ({(proofFile.size / 1024).toFixed(0)} KB)
                      </span>
                    )}
                  </div>

                  {/* Image Preview */}
                  {proofPreviewUrl && (
                    <div className="relative mt-2 max-w-xs overflow-hidden rounded-xl border border-zinc-700 bg-black">
                      <img
                        src={proofPreviewUrl}
                        alt="Payment proof preview"
                        className="max-h-52 w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setProofFile(null);
                          if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
                          setProofPreviewUrl(null);
                        }}
                        className="absolute right-2 top-2 rounded-full bg-zinc-900/80 p-1 text-white hover:bg-red-600 transition-colors"
                        title="Remove image"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 5: Immediate Authorization Option */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={authorizeImmediately}
                    onChange={e => setAuthorizeImmediately(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-700 text-cyan-400 focus:ring-cyan-400 bg-zinc-800"
                  />
                  <div>
                    <div className="text-sm font-bold text-white">
                      Immediately authorize customer to enter Steam Room
                    </div>
                    <div className="text-xs text-zinc-400">
                      Direct access authorization without Admin approval. Service completion can be marked in History.
                    </div>
                  </div>
                </label>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || !selectedCustomer || !activeOffering || (paymentMethod !== "CASH" && !proofFile)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-400 py-3.5 text-base font-black text-zinc-950 hover:bg-cyan-300 disabled:opacity-40 transition-all shadow-lg shadow-cyan-400/10 active:scale-[0.99]"
                >
                  <Sparkle weight="fill" className="h-5 w-5" />
                  <span>
                    {submitting
                      ? "Recording & Authorizing…"
                      : authorizeImmediately
                      ? `Register & Authorize Access (${formatETB(activeOffering?.price || 0)})`
                      : `Register Steam Service (${formatETB(activeOffering?.price || 0)})`}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* SECTION 2: HISTORY (PERMANENT ACCOUNTABILITY & MANAGEMENT) */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-white">Steam Transaction & Usage History</h3>
              <p className="text-xs text-zinc-400">
                Permanent record of registrations, payments, responsible staff, room authorizations, and session completions.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Search member, code, ref, staff…"
                className={`${inputClass} max-w-[210px]`}
              />
              <select
                value={paymentMethodFilter}
                onChange={e => setPaymentMethodFilter(e.target.value)}
                className={`${inputClass} max-w-[170px]`}
              >
                <option value="ALL">All Methods</option>
                <option value="TELEBIRR">Telebirr</option>
                <option value="CBE_BIRR">CBE Birr</option>
                <option value="CASH">Cash</option>
              </select>
              <input
                type="date"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className={`${inputClass} max-w-[150px]`}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-x-auto shadow-sm">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-zinc-800/60 text-xs font-bold uppercase text-zinc-400">
                <tr>
                  <th className="p-3.5">Registration Date</th>
                  <th className="p-3.5">Customer Information</th>
                  <th className="p-3.5">Payment Amount</th>
                  <th className="p-3.5">Payment Method</th>
                  <th className="p-3.5">Payment Status</th>
                  <th className="p-3.5">Reception Staff</th>
                  <th className="p-3.5">Payment Photo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredHistory.map(r => {
                  const normalizedMethod = (r.payment_method || "CASH").toUpperCase().trim();
                  const methodLabel = normalizedMethod === "TELEBIRR" ? "Telebirr" : normalizedMethod === "CBE_BIRR" || normalizedMethod === "CBE BIRR" ? "CBE Birr" : "Cash";
                  const methodBadgeColor = normalizedMethod === "TELEBIRR" ? "bg-amber-400/10 text-amber-300 border-amber-400/30" : normalizedMethod === "CBE_BIRR" || normalizedMethod === "CBE BIRR" ? "bg-purple-400/10 text-purple-300 border-purple-400/30" : "bg-zinc-800 text-zinc-300 border-zinc-700";

                  const isPaid = (r.payment_status || "").toUpperCase() === "PAID" || (r.payment_status || "").toUpperCase() === "APPROVED" || (r.service_status || "").toUpperCase() === "COMPLETED";

                  return (
                    <tr key={r.id} className="hover:bg-zinc-800/30 transition-colors">
                      {/* Date & Time */}
                      <td className="p-3.5 text-xs text-zinc-400">
                        <div>{new Date(r.created_at).toLocaleDateString()}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">
                          {new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="p-3.5">
                        <div className="font-bold text-white">{r.customer_name}</div>
                        <div className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-cyan-300">{r.customer_code}</span>
                          <span>·</span>
                          <span>{r.customer_category}</span>
                          {r.customer_phone && (
                            <>
                              <span>·</span>
                              <span>{r.customer_phone}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Payment Amount */}
                      <td className="p-3.5">
                        <span className="font-bold text-lime-400">{formatETB(r.amount)}</span>
                      </td>

                      {/* Payment Method */}
                      <td className="p-3.5">
                        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold border ${methodBadgeColor}`}>
                          {methodLabel}
                        </span>
                        {r.payment_reference && (
                          <div className="text-[11px] text-zinc-500 font-mono mt-0.5 truncate max-w-[140px]" title={r.payment_reference}>
                            Ref: {r.payment_reference}
                          </div>
                        )}
                      </td>

                      {/* Payment Status */}
                      <td className="p-3.5">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                          isPaid ? "bg-emerald-400/15 border-emerald-400/30 text-emerald-300" : "bg-amber-400/15 border-amber-400/30 text-amber-300"
                        }`}>
                          {isPaid ? "PAID" : (r.payment_status || "PAID")}
                        </span>
                      </td>

                      {/* Staff Member Responsible */}
                      <td className="p-3.5 text-xs">
                        <div className="text-zinc-200 font-medium">
                          {r.registered_by_email ? r.registered_by_email.split("@")[0] : "Reception"}
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate max-w-[140px]" title={r.registered_by_email || ""}>
                          {r.registered_by_email || "Staff account"}
                        </div>
                      </td>

                      {/* Payment Photo */}
                      <td className="p-3.5">
                        {r.payment_proof_path ? (
                          <button
                            onClick={() => handleViewProof(r)}
                            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5 text-cyan-400" />
                            <span>View Photo</span>
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-500 italic">No photo (Cash)</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredHistory.length === 0 && (
              <div className="p-8 text-center text-zinc-500 text-sm">
                No steam transactions found.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: VIEW PAYMENT PROOF PHOTO (AUTHENTICATED SHORT-LIVED SIGNED URL) */}
      {(viewingProofUrl || loadingProof) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-sm truncate mr-4">{viewingProofTitle}</h4>
              <button
                onClick={() => setViewingProofUrl(null)}
                className="rounded-full bg-zinc-800 p-1.5 text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center min-h-[300px] max-h-[70vh]">
              {loadingProof ? (
                <div className="text-zinc-500 text-sm">Generating secure view link…</div>
              ) : (
                <img
                  src={viewingProofUrl || ""}
                  alt="Payment proof"
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            <div className="flex justify-between items-center text-xs text-zinc-500 pt-1">
              <span>Private authenticated signed link (1-hour validity)</span>
              <button
                onClick={() => setViewingProofUrl(null)}
                className="rounded-lg bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
