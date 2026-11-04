import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Coins,
  Receipt,
  TrendUp,
  DownloadSimple,
  Plus,
  MagnifyingGlass,
  CalendarBlank,
  ChartBar,
  CreditCard,
} from "@phosphor-icons/react";
import { useGym, formatETB } from "../context/GymContext";
import type { Expense } from "../types";
import { toast } from "sonner";
import { useDashboardStats } from "../hooks/use-dashboard-stats";
import { useDashboardSupplementalData } from "../hooks/use-dashboard-supplemental-data";
import { usePayments } from "../hooks/use-payments";
import { useExpenses } from "../hooks/use-expenses";
import { createExpense } from "../services/expenses";
import { ReportsView } from "./AdminReports";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const INPUT = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50";
const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-6";
const TH = "text-left px-4 py-3";
const CHART_TOOLTIP = { background: "#18181b", border: "1px solid #27272a", borderRadius: 8 };

const EXPENSE_LABELS: Record<Expense["category"], string> = {
  rent: "Rent",
  utilities: "Utilities",
  equipment: "Equipment",
  salaries: "Salaries",
  maintenance: "Maintenance",
  other: "Other",
};

type FinanceTab = "overview" | "payments" | "expenses" | "reports";

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCsv = (val: string | number) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const csvContent =
    "data:text/csv;charset=utf-8," +
    [headers.map(escapeCsv).join(","), ...rows.map(row => row.map(escapeCsv).join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function AdminFinancesReports() {
  const [activeTab, setActiveTab] = useState<FinanceTab>("overview");

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "overview"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/20"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
          }`}
        >
          <Coins weight="fill" className="w-4 h-4" />
          <span>Financial Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("payments")}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "payments"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/20"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
          }`}
        >
          <CreditCard weight="fill" className="w-4 h-4" />
          <span>Payment Ledger</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("expenses")}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "expenses"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/20"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
          }`}
        >
          <Receipt weight="fill" className="w-4 h-4" />
          <span>Expenses</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("reports")}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "reports"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/20"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
          }`}
        >
          <ChartBar weight="fill" className="w-4 h-4" />
          <span>Reports</span>
        </button>
      </div>

      {/* Sub-tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === "overview" && <FinancialOverviewTab />}
          {activeTab === "payments" && <PaymentLedgerTab />}
          {activeTab === "expenses" && <ExpensesTab />}
          {activeTab === "reports" && <ReportsView />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function FinancialOverviewTab() {
  const { stats, isLoading, error, refresh } = useDashboardStats();
  const supplemental = useDashboardSupplementalData();
  const expenseLedger = useExpenses("", "all");

  const totalRevenue = stats?.totalRevenue ?? 0;
  const totalExpenses = expenseLedger.totalAmount || (stats?.totalExpense ?? 0);
  const netResult = totalRevenue - totalExpenses;
  const displayValue = (val: string) => (isLoading || expenseLedger.isLoading ? "..." : error ? "—" : val);

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <button onClick={() => void refresh()} className="font-semibold text-red-300 hover:text-white">Retry</button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 gap-4">
        <div className={CARD}>
          <div className="flex items-center gap-2 text-zinc-500 mb-1 text-sm">
            <Coins weight="fill" className="w-5 h-5 text-lime-400" />
            <span>Total Revenue</span>
          </div>
          <div className="text-3xl font-black text-lime-400">{displayValue(formatETB(totalRevenue))}</div>
          <div className="text-xs text-zinc-500 mt-1">Gross gym and services earnings</div>
        </div>

        <div className={CARD}>
          <div className="flex items-center gap-2 text-zinc-500 mb-1 text-sm">
            <Receipt weight="fill" className="w-5 h-5 text-red-400" />
            <span>Total Expenses</span>
          </div>
          <div className="text-3xl font-black text-red-400">{displayValue(formatETB(totalExpenses))}</div>
          <div className="text-xs text-zinc-500 mt-1">Operational costs, rent, & salaries</div>
        </div>

        <div className={CARD}>
          <div className="flex items-center gap-2 text-zinc-500 mb-1 text-sm">
            <TrendUp weight="fill" className={netResult >= 0 ? "w-5 h-5 text-lime-400" : "w-5 h-5 text-red-400"} />
            <span>Net Balance</span>
          </div>
          <div className={`text-3xl font-black ${netResult >= 0 ? "text-lime-400" : "text-red-400"}`}>
            {displayValue(formatETB(netResult))}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Net profit after expenses</div>
        </div>
      </div>

      {/* Monthly Financial Trend Chart */}
      <div className={CARD}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg text-white">Monthly Revenue vs Expenses</h3>
            <p className="text-xs text-zinc-400">Historical performance trend comparison</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-lime-400" /> Revenue</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-400" /> Expenses</span>
          </div>
        </div>

        {supplemental.isLoading && <div className="h-[280px] flex items-center justify-center text-sm text-zinc-500">Loading trend...</div>}
        {!supplemental.isLoading && supplemental.trendError && (
          <div className="h-[280px] flex flex-col items-center justify-center gap-2 text-sm text-red-300">
            <span>{supplemental.trendError}</span>
            <button onClick={() => void supplemental.refresh()} className="font-semibold hover:text-white">Retry</button>
          </div>
        )}
        {!supplemental.isLoading && !supplemental.trendError && supplemental.financialTrend?.length === 0 && (
          <div className="h-[280px] flex items-center justify-center text-sm text-zinc-500">No trend data available.</div>
        )}
        {!supplemental.isLoading && !supplemental.trendError && supplemental.financialTrend && supplemental.financialTrend.length > 0 && (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={supplemental.financialTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} />
              <Tooltip contentStyle={CHART_TOOLTIP} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#a3e635" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="expenses" name="Expense" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Category Breakdown */}
      {supplemental.categoryBreakdown && supplemental.categoryBreakdown.length > 0 && (
        <div className={CARD}>
          <h3 className="font-bold text-base mb-4 text-white">Revenue by Customer Category</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {supplemental.categoryBreakdown.map(item => (
              <div key={item.planName} className="bg-zinc-800/50 rounded-2xl p-4">
                <div className="text-sm font-semibold text-zinc-300">{item.planName}</div>
                <div className="text-2xl font-black text-lime-400 mt-1">{item.memberCount} members</div>
                <div className="text-xs text-zinc-400 mt-0.5">{formatETB(item.revenue)} generated</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentLedgerTab() {
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const paymentLedger = usePayments(paymentSearch, paymentStatus, paymentMethod);

  // Client-side date range filter applied on loaded payments
  const displayedPayments = useMemo(() => {
    return paymentLedger.payments.filter(p => {
      const pDate = (p.paid_at || p.created_at || "").slice(0, 10);
      if (startDate && pDate < startDate) return false;
      if (endDate && pDate > endDate) return false;
      return true;
    });
  }, [paymentLedger.payments, startDate, endDate]);

  const handleExportCsv = () => {
    const headers = ["Date", "Member Name", "Customer Code", "Plan", "Payment Method", "Status", "Reference", "Amount (ETB)"];
    const rows = displayedPayments.map(p => [
      (p.paid_at || p.created_at || "").slice(0, 10),
      p.customer ? `${p.customer.first_name} ${p.customer.last_name}`.trim() : "Unknown",
      p.customer?.customer_code || "",
      p.planName || "",
      p.payment_method || "",
      p.payment_status || "",
      p.transaction_reference || "",
      Number(p.amount) || 0,
    ]);
    downloadCsv(`powerplus-payments-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    toast.success("Payments ledger exported to CSV");
  };

  const paymentPages = Math.ceil(paymentLedger.total / paymentLedger.pageSize);

  return (
    <div className="space-y-4">
      {/* Filters and Actions Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[200px] flex-1">
            <MagnifyingGlass className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={paymentSearch}
              onChange={e => setPaymentSearch(e.target.value)}
              placeholder="Search customer, code, or ref..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50"
            />
          </div>

          <select
            value={paymentStatus}
            onChange={e => setPaymentStatus(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="PAID">PAID</option>
            <option value="PENDING">PENDING</option>
            <option value="FAILED">FAILED</option>
          </select>

          <select
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
          >
            <option value="all">All Methods</option>
            <option value="CASH">Cash</option>
            <option value="TELEBIRR">Telebirr</option>
            <option value="CBE_BIRR">CBE Birr</option>
          </select>

          {/* Date Filters */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs">
            <CalendarBlank className="w-4 h-4 text-zinc-500" />
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-transparent text-white focus:outline-none"
              title="From date"
            />
            <span className="text-zinc-600">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-transparent text-white focus:outline-none"
              title="To date"
            />
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => { setStartDate(""); setEndDate(""); }}
                className="text-zinc-400 hover:text-white text-xs ml-1 font-bold"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Export Button */}
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={displayedPayments.length === 0}
          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors self-start lg:self-auto"
        >
          <DownloadSimple className="w-4 h-4 text-lime-400" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Payments Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
        {paymentLedger.error && (
          <div className="flex items-center justify-between gap-4 border-b border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            <span>{paymentLedger.error}</span>
            <button onClick={() => void paymentLedger.refresh()} className="font-semibold text-red-300 hover:text-white">Retry</button>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50">
            <tr>
              <th className={TH}>Date</th>
              <th className={TH}>Member</th>
              <th className={TH}>Customer Code</th>
              <th className={TH}>Plan</th>
              <th className={TH}>Method</th>
              <th className={TH}>Status</th>
              <th className={TH}>Reference</th>
              <th className="text-right px-4 py-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {displayedPayments.map(p => {
              const date = p.paid_at || p.created_at;
              return (
                <tr key={p.id} className="border-t border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                  <td className="px-4 py-3 text-zinc-400">{date ? date.slice(0, 10) : "—"}</td>
                  <td className="px-4 py-3 font-medium text-white">{p.customer ? `${p.customer.first_name} ${p.customer.last_name}` : "Unknown"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-lime-400">{p.customer?.customer_code || "—"}</td>
                  <td className="px-4 py-3 text-zinc-300">{p.planName || "—"}</td>
                  <td className="px-4 py-3">{p.payment_method || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      p.payment_status === "PAID"
                        ? "bg-lime-400/20 text-lime-400"
                        : p.payment_status === "PENDING"
                        ? "bg-amber-400/20 text-amber-300"
                        : "bg-red-400/20 text-red-400"
                    }`}>
                      {p.payment_status || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{p.transaction_reference || "—"}</td>
                  <td className="px-4 py-3 text-right text-lime-400 font-bold">{formatETB(Number(p.amount) || 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {paymentLedger.isLoading && <div className="p-8 text-center text-zinc-500">Loading payments...</div>}
        {!paymentLedger.isLoading && !paymentLedger.error && displayedPayments.length === 0 && (
          <div className="p-8 text-center text-zinc-500">No payment records found</div>
        )}
      </div>

      {/* Pagination */}
      {!paymentLedger.isLoading && paymentPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-400">
          <span>Page {paymentLedger.page + 1} of {paymentPages}</span>
          <div className="flex gap-2">
            <button
              disabled={paymentLedger.page === 0}
              onClick={() => paymentLedger.setPage(paymentLedger.page - 1)}
              className="rounded-lg bg-zinc-800 px-3 py-2 disabled:opacity-40 hover:bg-zinc-700 transition-colors"
            >
              Previous
            </button>
            <button
              disabled={paymentLedger.page >= paymentPages - 1}
              onClick={() => paymentLedger.setPage(paymentLedger.page + 1)}
              className="rounded-lg bg-zinc-800 px-3 py-2 disabled:opacity-40 hover:bg-zinc-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpensesTab() {
  const { state } = useGym();
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const expenseLedger = useExpenses(expenseSearch, expenseCategory);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expForm, setExpForm] = useState({
    category: "rent" as Expense["category"],
    amount: 0,
    description: "",
    expenseDate: new Date().toISOString().slice(0, 10),
  });

  const displayedExpenses = useMemo(() => {
    return expenseLedger.expenses.filter(e => {
      const eDate = (e.expense_date || "").slice(0, 10);
      if (startDate && eDate < startDate) return false;
      if (endDate && eDate > endDate) return false;
      return true;
    });
  }, [expenseLedger.expenses, startDate, endDate]);

  const addExpense = async () => {
    if (!expForm.description || expForm.amount <= 0) {
      toast.error("Enter a description and a valid amount");
      return;
    }
    if (!state.currentUser?.id) {
      toast.error("You must be signed in to record an expense");
      return;
    }
    try {
      await createExpense({
        category: expForm.category,
        amount: expForm.amount,
        expenseDate: expForm.expenseDate,
        note: expForm.description,
        recordedBy: state.currentUser.id,
      });
      await expenseLedger.refresh();
      toast.success("Expense saved successfully");
      setShowExpenseForm(false);
      setExpForm({ category: "rent", amount: 0, description: "", expenseDate: new Date().toISOString().slice(0, 10) });
    } catch (cause) {
      console.error("Unable to save expense", cause);
      toast.error(cause instanceof Error ? cause.message : "Unable to save expense.");
    }
  };

  const handleExportCsv = () => {
    const headers = ["Date", "Category", "Note", "Recorded By", "Amount (ETB)"];
    const rows = displayedExpenses.map(e => [
      e.expense_date || "",
      EXPENSE_LABELS[e.category as Expense["category"]] || e.category,
      e.note || "",
      e.recorded_by || "",
      Number(e.amount) || 0,
    ]);
    downloadCsv(`powerplus-expenses-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    toast.success("Expenses exported to CSV");
  };

  return (
    <div className="space-y-4">
      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[200px] flex-1">
            <MagnifyingGlass className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={expenseSearch}
              onChange={e => setExpenseSearch(e.target.value)}
              placeholder="Search category or note..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50"
            />
          </div>

          <select
            value={expenseCategory}
            onChange={e => setExpenseCategory(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
          >
            <option value="all">All Categories</option>
            {(Object.keys(EXPENSE_LABELS) as Expense["category"][]).map(category => (
              <option key={category} value={category}>{EXPENSE_LABELS[category]}</option>
            ))}
          </select>

          {/* Date Filter */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs">
            <CalendarBlank className="w-4 h-4 text-zinc-500" />
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-transparent text-white focus:outline-none"
              title="From date"
            />
            <span className="text-zinc-600">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-transparent text-white focus:outline-none"
              title="To date"
            />
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => { setStartDate(""); setEndDate(""); }}
                className="text-zinc-400 hover:text-white text-xs ml-1 font-bold"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-auto">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={displayedExpenses.length === 0}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
          >
            <DownloadSimple className="w-4 h-4 text-lime-400" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setShowExpenseForm(true)}
            className="bg-lime-400 text-zinc-950 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-lime-300 shadow-sm shadow-lime-400/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
        {expenseLedger.error && (
          <div className="flex items-center justify-between gap-4 border-b border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            <span>{expenseLedger.error}</span>
            <button onClick={() => void expenseLedger.refresh()} className="font-semibold text-red-300 hover:text-white">Retry</button>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50">
            <tr>
              <th className={TH}>Date</th>
              <th className={TH}>Category</th>
              <th className={TH}>Note</th>
              <th className={TH}>Recorded By</th>
              <th className="text-right px-4 py-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {displayedExpenses.map(e => (
              <tr key={e.id} className="border-t border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                <td className="px-4 py-3 text-zinc-400">{e.expense_date}</td>
                <td className="px-4 py-3">
                  <span className="bg-zinc-800 px-2.5 py-1 rounded-md text-xs font-semibold text-zinc-300">
                    {EXPENSE_LABELS[e.category as Expense["category"]] || e.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-white">{e.note || "—"}</td>
                <td className="px-4 py-3 text-zinc-400">{e.recorded_by || "—"}</td>
                <td className="px-4 py-3 text-right text-red-400 font-bold">{formatETB(Number(e.amount) || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {expenseLedger.isLoading && <div className="p-8 text-center text-zinc-500">Loading expenses...</div>}
        {!expenseLedger.isLoading && !expenseLedger.error && displayedExpenses.length === 0 && (
          <div className="p-8 text-center text-zinc-500">No expense records found</div>
        )}
      </div>

      {/* Pagination */}
      {!expenseLedger.isLoading && Math.ceil(expenseLedger.total / expenseLedger.pageSize) > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-400">
          <span>Page {expenseLedger.page + 1} of {Math.ceil(expenseLedger.total / expenseLedger.pageSize)}</span>
          <div className="flex gap-2">
            <button
              disabled={expenseLedger.page === 0}
              onClick={() => expenseLedger.setPage(expenseLedger.page - 1)}
              className="rounded-lg bg-zinc-800 px-3 py-2 disabled:opacity-40 hover:bg-zinc-700 transition-colors"
            >
              Previous
            </button>
            <button
              disabled={expenseLedger.page >= Math.ceil(expenseLedger.total / expenseLedger.pageSize) - 1}
              onClick={() => expenseLedger.setPage(expenseLedger.page + 1)}
              className="rounded-lg bg-zinc-800 px-3 py-2 disabled:opacity-40 hover:bg-zinc-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      <AnimatePresence>
        {showExpenseForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setShowExpenseForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className={`${CARD} w-full max-w-md`}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold mb-4 text-white">Add Expense</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Expense Category</label>
                  <select
                    value={expForm.category}
                    onChange={e => setExpForm({ ...expForm, category: e.target.value as Expense["category"] })}
                    className={INPUT}
                  >
                    {(Object.keys(EXPENSE_LABELS) as Expense["category"][]).map(c => (
                      <option key={c} value={c}>{EXPENSE_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Amount (ETB)</label>
                  <input
                    type="number"
                    value={expForm.amount || ""}
                    onChange={e => setExpForm({ ...expForm, amount: Number(e.target.value) })}
                    placeholder="Amount in ETB"
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Expense Date</label>
                  <input
                    type="date"
                    value={expForm.expenseDate}
                    onChange={e => setExpForm({ ...expForm, expenseDate: e.target.value })}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Description / Note</label>
                  <input
                    value={expForm.description}
                    onChange={e => setExpForm({ ...expForm, description: e.target.value })}
                    placeholder="Description or purpose of expense"
                    className={INPUT}
                  />
                </div>
                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowExpenseForm(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void addExpense()}
                    disabled={expenseLedger.isLoading}
                    className="flex-1 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold py-2.5 rounded-xl disabled:opacity-60 transition-colors shadow-md shadow-lime-400/20"
                  >
                    Save Expense
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
