import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MagnifyingGlass, Plus, X, Key, Copy, CheckCircle, Warning } from "@phosphor-icons/react";
import { useGym, formatETB, categoryLabelOf } from "../context/GymContext";
import type { Expense, CategoryLabel } from "../types";
import { toast } from "sonner";
import { useDashboardStats } from "../hooks/use-dashboard-stats";
import { useCustomers } from "../hooks/use-customers";
import { usePayments } from "../hooks/use-payments";
import { useExpenses } from "../hooks/use-expenses";
import { createExpense } from "../services/expenses";
import { fetchCategories, getLocalCategories } from "../services/categories";
import { adminResetCustomerCredentials, type CustomerRecord, type ResetCredentialsResult } from "../services/customers";

const INPUT = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50";
const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-6";
const TH = "text-left px-4 py-3";
const STATUS_LABELS: Record<string, string> = { active: "Active", expiring: "Expiring soon", expired: "Expired", inactive: "Inactive", blocked: "Blocked" };
const STATUS_COLORS: Record<string, string> = { active: "bg-lime-400/20 text-lime-400", expiring: "bg-yellow-400/20 text-yellow-400", expired: "bg-red-400/20 text-red-400", inactive: "bg-zinc-400/20 text-zinc-400", blocked: "bg-purple-400/20 text-purple-400" };
const EXPENSE_LABELS: Record<Expense["category"], string> = { rent: "Rent", utilities: "Utilities", equipment: "Equipment", salaries: "Salaries", maintenance: "Maintenance", other: "Other" };

export function CustomersView() {
  const { state } = useGym();
  const [categories, setCategories] = useState<CategoryLabel[]>(() => getLocalCategories());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [resetResult, setResetResult] = useState<ResetCredentialsResult | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [copiedField, setCopiedField] = useState<"login" | "password" | null>(null);

  const handleResetCredentials = async (customer: CustomerRecord) => {
    const fullName = `${customer.first_name} ${customer.last_name}`.trim();
    if (!window.confirm(`Are you sure you want to reset login credentials for ${fullName} (${customer.customer_code})? The customer's current password will no longer work.`)) {
      return;
    }

    setIsResetting(true);
    try {
      const res = await adminResetCustomerCredentials(customer.id);
      setResetResult(res);
      toast.success(`Credentials reset for ${fullName}`);
    } catch (err) {
      console.error("Reset credentials error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to reset credentials.");
    } finally {
      setIsResetting(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    fetchCategories()
      .then(cats => {
        if (mounted && cats.length > 0) {
          setCategories(cats);
        }
      })
      .catch(console.error);
    return () => {
      mounted = false;
    };
  }, []);

  const { customers, memberships, plans, total, page, pageSize, isLoading, error, refresh, setPage } = useCustomers(search, statusFilter, categoryFilter);
  const selectedMembership = selectedCustomer ? memberships.find(membership => membership.customer_id === selectedCustomer.id) : undefined;
  const selectedPlan = selectedMembership?.plan_id ? plans.find(plan => plan.id === selectedMembership.plan_id) : undefined;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlass className="w-5 h-5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone or member ID..." className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none">
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat.category} value={cat.category}>
              {cat.label}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none">
          <option value="all">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="BLOCKED">Blocked</option>
        </select>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {error && <div className="flex items-center justify-between gap-4 border-b border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"><span>{error}</span><button onClick={() => void refresh()} className="font-semibold text-red-300 hover:text-white">Retry</button></div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800/50">
              <tr><th className={TH}>Member</th><th className={TH}>Member ID</th><th className={TH}>Category</th><th className={TH}>Plan</th><th className={TH}>Status</th><th className={TH}>Expiry</th><th className={TH}>Actions</th></tr>
            </thead>
            <tbody>
              {customers.map(customer => {
                const membership = memberships.find(item => item.customer_id === customer.id);
                const plan = membership?.plan_id ? plans.find(item => item.id === membership.plan_id) : undefined;
                const name = `${customer.first_name} ${customer.last_name}`.trim();
                const status = customer.status.toUpperCase();
                return (
                  <tr key={customer.id} className="border-t border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-3"><div className="font-semibold">{name}</div><div className="text-zinc-500 text-xs">{customer.phone || "No phone"}</div></td>
                    <td className="px-4 py-3 font-mono text-xs">{customer.customer_code}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-300">
                        {categoryLabelOf(state, customer.customer_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{plan?.name || "Not set"}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[status.toLowerCase()] || "bg-zinc-400/20 text-zinc-400"}`}>{STATUS_LABELS[status.toLowerCase()] || status}</span></td>
                    <td className="px-4 py-3 text-zinc-400">{membership?.end_date || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSelectedCustomer(customer)} className="text-lime-400 hover:text-lime-300 text-xs font-semibold">Details</button>
                        <span className="text-zinc-700">·</span>
                        <button
                          disabled={isResetting}
                          onClick={() => void handleResetCredentials(customer)}
                          className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                          title="Reset Login Credentials"
                        >
                          <Key className="w-3.5 h-3.5" />
                          <span>Reset</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {isLoading && <div className="p-8 text-center text-zinc-500">Loading customers...</div>}
        {!isLoading && !error && customers.length === 0 && <div className="p-8 text-center text-zinc-500">No customers found</div>}
      </div>
      {!isLoading && totalPages > 1 && <div className="flex items-center justify-between text-sm text-zinc-400"><span>Page {page + 1} of {totalPages}</span><div className="flex gap-2"><button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg bg-zinc-800 px-3 py-2 disabled:opacity-40">Previous</button><button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="rounded-lg bg-zinc-800 px-3 py-2 disabled:opacity-40">Next</button></div></div>}
      <AnimatePresence>
        {selectedCustomer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setSelectedCustomer(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-2">
                <div><h3 className="text-xl font-bold">{selectedCustomer.first_name} {selectedCustomer.last_name}</h3><p className="text-zinc-500 text-sm">{selectedCustomer.customer_code} · {selectedCustomer.phone || "No phone"}</p></div>
                <button onClick={() => setSelectedCustomer(null)}><X className="w-5 h-5 text-zinc-400" /></button>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-zinc-500">E-mail :</span> {selectedCustomer.email || "—"}</div>
                <div><span className="text-zinc-500">Status :</span> {selectedCustomer.status}</div>
                <div><span className="text-zinc-500">Joined :</span> {selectedCustomer.join_date || "—"}</div>
                <div><span className="text-zinc-500">National ID :</span> {selectedCustomer.national_id || "—"}</div>
                <div><span className="text-zinc-500">Date of birth :</span> {selectedCustomer.date_of_birth || "—"}</div>
                <div><span className="text-zinc-500">Gender :</span> {selectedCustomer.gender || "—"}</div>
                <div><span className="text-zinc-500">Category :</span> {categoryLabelOf(state, selectedCustomer.customer_type)}</div>
                <div><span className="text-zinc-500">Address :</span> {selectedCustomer.address || "—"}</div>
                <div><span className="text-zinc-500">Plan :</span> {selectedPlan?.name || "Not set"}</div>
                <div><span className="text-zinc-500">Membership status :</span> {selectedMembership?.status || "—"}</div>
                <div><span className="text-zinc-500">Membership start :</span> {selectedMembership?.start_date || "—"}</div>
                <div><span className="text-zinc-500">Membership end :</span> {selectedMembership?.end_date || "—"}</div>
              </div>
              {selectedCustomer.notes && <div className="border-t border-zinc-800 pt-3 text-sm"><span className="text-zinc-500">Notes :</span> {selectedCustomer.notes}</div>}

              {/* Reset Credentials Action */}
              <div className="border-t border-zinc-800 pt-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-zinc-300 block">Login Credentials</span>
                  <span className="text-[11px] text-zinc-500 block">Reset access and generate a new temporary password.</span>
                </div>
                <button
                  type="button"
                  disabled={isResetting}
                  onClick={() => void handleResetCredentials(selectedCustomer)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-400/10 border border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/20 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{isResetting ? "Resetting…" : "Reset Login Credentials"}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Credentials Reset Success Modal (Shown Once) */}
        {resetResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-cyan-400/20 text-cyan-400 flex items-center justify-center">
                  <Key weight="duotone" className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Credentials Reset Successfully</h3>
                  <p className="text-xs text-zinc-400">One-time temporary password generated</p>
                </div>
              </div>

              <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4 space-y-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Customer</div>
                  <div className="text-sm font-semibold text-white mt-0.5">{resetResult.customerName}</div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-700/40">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Customer ID</div>
                    <div className="text-sm font-mono font-semibold text-cyan-300 mt-0.5">{resetResult.customerCode}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Login ID</div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="text-sm font-mono font-bold text-white">{resetResult.loginId}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(resetResult.loginId);
                          setCopiedField("login");
                          toast.success("Login ID copied!");
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                        className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                        title="Copy Login ID"
                      >
                        {copiedField === "login" ? <CheckCircle weight="fill" className="w-4 h-4 text-lime-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-700/40">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">New Temporary Password</div>
                  <div className="flex items-center justify-between gap-2 mt-1 bg-zinc-950/80 border border-zinc-700/60 rounded-lg px-3 py-2">
                    <span className="font-mono text-base font-bold text-cyan-300 tracking-wider">
                      {resetResult.newTempPassword}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(resetResult.newTempPassword);
                        setCopiedField("password");
                        toast.success("New temporary password copied!");
                        setTimeout(() => setCopiedField(null), 2000);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 hover:text-white transition-colors"
                    >
                      {copiedField === "password" ? (
                        <>
                          <CheckCircle weight="fill" className="w-3.5 h-3.5 text-lime-400" />
                          <span className="text-lime-400 font-semibold">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-amber-400/10 border border-amber-400/30 p-3 flex gap-2.5 text-xs text-amber-200">
                <Warning weight="fill" className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <p>
                  <strong>Security Note:</strong> The previous password no longer works. Please share this new temporary password with the member. It is not saved in plaintext and will not be displayed again.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setResetResult(null)}
                className="w-full py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-zinc-950 font-black text-sm transition-colors"
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FinancesView() {
  const { state } = useGym();
  const { stats, isLoading, error, refresh } = useDashboardStats();
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const paymentLedger = usePayments(paymentSearch, paymentStatus, paymentMethod);
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("all");
  const expenseLedger = useExpenses(expenseSearch, expenseCategory);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expForm, setExpForm] = useState({ category: "rent" as Expense["category"], amount: 0, description: "", expenseDate: new Date().toISOString().slice(0, 10) });

  const addExpense = async () => {
    if (!expForm.description || expForm.amount <= 0) { toast.error("Enter a description and a valid amount"); return; }
    if (!state.currentUser?.id) { toast.error("You must be signed in to record an expense"); return; }
    try {
      await createExpense({ category: expForm.category, amount: expForm.amount, expenseDate: expForm.expenseDate, note: expForm.description, recordedBy: state.currentUser.id });
      await expenseLedger.refresh();
      toast.success("Expense saved");
      setShowExpenseForm(false);
      setExpForm({ category: "rent", amount: 0, description: "", expenseDate: new Date().toISOString().slice(0, 10) });
    } catch (cause) {
      console.error("Unable to save expense", cause);
      toast.error(cause instanceof Error ? cause.message : "Unable to save expense.");
    }
  };

  const totalRevenue = stats?.totalRevenue ?? 0;
  const totalExpenses = expenseLedger.totalAmount;
  const netResult = totalRevenue - totalExpenses;
  const displayValue = (value: string) => isLoading || expenseLedger.isLoading ? "..." : error || expenseLedger.error ? "—" : value;
  const paymentPages = Math.ceil(paymentLedger.total / paymentLedger.pageSize);

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <button onClick={() => void refresh()} className="font-semibold text-red-300 hover:text-white">Retry</button>
        </div>
      )}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 gap-4">
        <div className={CARD}><div className="text-sm text-zinc-500 mb-1">Total revenue</div><div className="text-2xl font-black text-lime-400">{displayValue(formatETB(totalRevenue))}</div></div>
        <div className={CARD}><div className="text-sm text-zinc-500 mb-1">Total expenses</div><div className="text-2xl font-black text-red-400">{displayValue(formatETB(totalExpenses))}</div></div>
        <div className={CARD}><div className="text-sm text-zinc-500 mb-1">Net balance</div><div className={`text-2xl font-black ${netResult >= 0 ? "text-lime-400" : "text-red-400"}`}>{displayValue(formatETB(netResult))}</div></div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="font-bold text-lg">Payment ledger</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={paymentSearch} onChange={e => setPaymentSearch(e.target.value)} placeholder="Search customer or reference" className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />
          <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none">
            <option value="all">All Status</option>
            <option value="PAID">PAID</option>
            <option value="PENDING">PENDING</option>
            <option value="FAILED">FAILED</option>
          </select>
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none">
            <option value="all">All Methods</option>
            <option value="CASH">Cash</option>
            <option value="TELEBIRR">Telebirr</option>
            <option value="CBE_BIRR">CBE Birr</option>
          </select>
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
        {paymentLedger.error && <div className="flex items-center justify-between gap-4 border-b border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"><span>{paymentLedger.error}</span><button onClick={() => void paymentLedger.refresh()} className="font-semibold text-red-300 hover:text-white">Retry</button></div>}
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50"><tr><th className={TH}>Date</th><th className={TH}>Member</th><th className={TH}>Customer code</th><th className={TH}>Plan</th><th className={TH}>Method</th><th className={TH}>Status</th><th className={TH}>Reference</th><th className="text-right px-4 py-3">Amount</th></tr></thead>
          <tbody>
            {paymentLedger.payments.map(p => {
              const date = p.paid_at || p.created_at;
              return (
                <tr key={p.id} className="border-t border-zinc-800/50">
                  <td className="px-4 py-3 text-zinc-400">{date.slice(0, 10)}</td>
                  <td className="px-4 py-3">{p.customer ? `${p.customer.first_name} ${p.customer.last_name}` : "Unknown"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.customer?.customer_code || "—"}</td>
                  <td className="px-4 py-3">{p.planName || "—"}</td>
                  <td className="px-4 py-3">{p.payment_method || "—"}</td>
                  <td className="px-4 py-3 text-zinc-400">{p.payment_status || "—"}</td>
                  <td className="px-4 py-3 text-zinc-400">{p.transaction_reference || "—"}</td>
                  <td className="px-4 py-3 text-right text-lime-400 font-semibold">{formatETB(Number(p.amount) || 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {paymentLedger.isLoading && <div className="p-8 text-center text-zinc-500">Loading payments...</div>}
        {!paymentLedger.isLoading && !paymentLedger.error && paymentLedger.payments.length === 0 && <div className="p-8 text-center text-zinc-500">No payments found</div>}
      </div>
      {!paymentLedger.isLoading && paymentPages > 1 && <div className="flex items-center justify-between text-sm text-zinc-400"><span>Page {paymentLedger.page + 1} of {paymentPages}</span><div className="flex gap-2"><button disabled={paymentLedger.page === 0} onClick={() => paymentLedger.setPage(paymentLedger.page - 1)} className="rounded-lg bg-zinc-800 px-3 py-2 disabled:opacity-40">Previous</button><button disabled={paymentLedger.page >= paymentPages - 1} onClick={() => paymentLedger.setPage(paymentLedger.page + 1)} className="rounded-lg bg-zinc-800 px-3 py-2 disabled:opacity-40">Next</button></div></div>}
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-lg">Expenses</h3>
        <button onClick={() => setShowExpenseForm(true)} className="bg-lime-400 text-zinc-950 px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-lime-300"><Plus className="w-4 h-4" /> Add expense</button>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={expenseSearch} onChange={e => setExpenseSearch(e.target.value)} placeholder="Search category or note" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />
        <select value={expenseCategory} onChange={e => setExpenseCategory(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none">
          <option value="all">All categories</option>
          {(Object.keys(EXPENSE_LABELS) as Expense["category"][]).map(category => <option key={category} value={category}>{EXPENSE_LABELS[category]}</option>)}
        </select>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
        {expenseLedger.error && <div className="flex items-center justify-between gap-4 border-b border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"><span>{expenseLedger.error}</span><button onClick={() => void expenseLedger.refresh()} className="font-semibold text-red-300 hover:text-white">Retry</button></div>}
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50"><tr><th className={TH}>Date</th><th className={TH}>Category</th><th className={TH}>Note</th><th className={TH}>Recorded by</th><th className="text-right px-4 py-3">Amount</th></tr></thead>
          <tbody>
            {expenseLedger.expenses.map(e => (
              <tr key={e.id} className="border-t border-zinc-800/50">
                <td className="px-4 py-3 text-zinc-400">{e.expense_date}</td>
                <td className="px-4 py-3"><span className="bg-zinc-800 px-2 py-1 rounded text-xs">{EXPENSE_LABELS[e.category as Expense["category"]] || e.category}</span></td>
                <td className="px-4 py-3">{e.note || "—"}</td>
                <td className="px-4 py-3 text-zinc-400">{e.recorded_by || "—"}</td>
                <td className="px-4 py-3 text-right text-red-400 font-semibold">{formatETB(Number(e.amount) || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {expenseLedger.isLoading && <div className="p-8 text-center text-zinc-500">Loading expenses...</div>}
        {!expenseLedger.isLoading && !expenseLedger.error && expenseLedger.expenses.length === 0 && <div className="p-8 text-center text-zinc-500">No expenses found</div>}
      </div>
      {!expenseLedger.isLoading && Math.ceil(expenseLedger.total / expenseLedger.pageSize) > 1 && <div className="flex items-center justify-between text-sm text-zinc-400"><span>Page {expenseLedger.page + 1} of {Math.ceil(expenseLedger.total / expenseLedger.pageSize)}</span><div className="flex gap-2"><button disabled={expenseLedger.page === 0} onClick={() => expenseLedger.setPage(expenseLedger.page - 1)} className="rounded-lg bg-zinc-800 px-3 py-2 disabled:opacity-40">Previous</button><button disabled={expenseLedger.page >= Math.ceil(expenseLedger.total / expenseLedger.pageSize) - 1} onClick={() => expenseLedger.setPage(expenseLedger.page + 1)} className="rounded-lg bg-zinc-800 px-3 py-2 disabled:opacity-40">Next</button></div></div>}
      <AnimatePresence>
        {showExpenseForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowExpenseForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className={`${CARD} w-full max-w-md`} onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bold mb-4">Add expense</h3>
              <div className="space-y-3">
                <select value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value as Expense["category"] })} className={INPUT}>
                  {(Object.keys(EXPENSE_LABELS) as Expense["category"][]).map(c => <option key={c} value={c}>{EXPENSE_LABELS[c]}</option>)}
                </select>
                <input type="number" value={expForm.amount || ""} onChange={e => setExpForm({ ...expForm, amount: Number(e.target.value) })} placeholder="Amount (Br)" className={INPUT} />
                <input type="date" value={expForm.expenseDate} onChange={e => setExpForm({ ...expForm, expenseDate: e.target.value })} className={INPUT} />
                <input value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })} placeholder="Description" className={INPUT} />
                <button onClick={() => void addExpense()} disabled={expenseLedger.isLoading} className="w-full bg-lime-400 text-zinc-950 font-bold py-3 rounded-xl hover:bg-lime-300 disabled:opacity-60">Save expense</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}