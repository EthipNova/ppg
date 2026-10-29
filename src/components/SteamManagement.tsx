import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { approveSteamPayment, cancelSteamEntitlement, fetchPendingSteamPayments, fetchSteamEntitlements, fetchSteamServiceOfferings, purchaseSteamWithCash, recordSteamCheckin, rejectSteamPayment, saveSteamOffering, searchSteamCustomers, type PendingSteamPayment, type SteamCustomerOption, type SteamEntitlementRow, type SteamServiceOffering } from "../services/steamOperations";

const inputClass = "w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:border-lime-400/60 focus:outline-none";
const blankOffering: SteamServiceOffering = { id: "", name: "", description: "", price: 0, active: true, accessType: "package", durationDays: 30, usageLimit: 10, trackUsage: true };

export default function SteamManagement({ canManageServices }: { canManageServices: boolean }) {
  const [offerings, setOfferings] = useState<SteamServiceOffering[]>([]);
  const [entitlements, setEntitlements] = useState<SteamEntitlementRow[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PendingSteamPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SteamServiceOffering>(blankOffering);
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<SteamCustomerOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [status, setStatus] = useState("ALL");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const purchaseRequestKey = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextOfferings, nextEntitlements, nextPending] = await Promise.all([fetchSteamServiceOfferings(), fetchSteamEntitlements(), fetchPendingSteamPayments()]);
      setOfferings(nextOfferings);
      setEntitlements(nextEntitlements);
      setPendingPayments(nextPending);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Steam management data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let active = true;
    if (search.trim().length < 2) { setCustomers([]); return; }
    const timer = window.setTimeout(() => {
      void searchSteamCustomers(search).then(result => { if (active) setCustomers(result); })
        .catch(cause => { if (active) toast.error(cause instanceof Error ? cause.message : "Customer search failed."); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search]);

  const selectedCustomer = customers.find(customer => customer.id === customerId);
  const activeOfferings = offerings.filter(offering => offering.active);
  const selectedOffering = activeOfferings.find(offering => offering.id === serviceId);
  const selectedCustomerAccess = entitlements.filter(row => row.customerId === customerId);
  const visibleEntitlements = useMemo(() => entitlements.filter(row => {
    const date = row.purchaseDate.slice(0, 10);
    const query = historySearch.trim().toLowerCase();
    return (status === "ALL" || row.status.toUpperCase() === status)
      && (methodFilter === "ALL" || row.paymentMethod === methodFilter)
      && (!fromDate || date >= fromDate)
      && (!toDate || date <= toDate)
      && (!query || `${row.customerName} ${row.serviceName}`.toLowerCase().includes(query));
  }), [entitlements, status, methodFilter, fromDate, toDate, historySearch]);
  const revenue = entitlements.reduce((total, row) => total + (row.paymentStatus === "PAID" ? row.price : 0), 0);

  const runAction = async (action: () => Promise<void>, success: string) => {
    setSaving(true);
    try { await action(); toast.success(success); await refresh(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Steam operation failed."); }
    finally { setSaving(false); }
  };

  const saveOffering = () => {
    if (!form.name.trim() || form.price <= 0 || form.durationDays < 1 || (form.usageLimit !== null && form.usageLimit < 1) || (form.usageLimit !== null && !form.trackUsage)) {
      toast.error("Enter a name, positive price and validity. A use limit requires usage tracking.");
      return;
    }
    void runAction(() => saveSteamOffering(form), "Steam service saved.").then(() => setForm(blankOffering));
  };

  const doPurchase = () => {
    if (!selectedCustomer || !selectedOffering) return;
    if (!window.confirm(`Record a cash payment of ${selectedOffering.price.toLocaleString()} ETB for ${selectedCustomer.name}?`)) return;
    purchaseRequestKey.current ??= crypto.randomUUID();
    const requestKey = purchaseRequestKey.current;
    void runAction(async () => {
      await purchaseSteamWithCash(selectedCustomer.id, selectedOffering.id, requestKey);
      purchaseRequestKey.current = null;
    }, "Cash payment recorded and access activated.");
  };

  const doCheckin = (access: SteamEntitlementRow) => {
    if (!window.confirm(`Record one Steam use for ${access.customerName}?`)) return;
    void runAction(() => recordSteamCheckin(access.id), "Steam use recorded.");
  };

  const doCancel = (access: SteamEntitlementRow) => {
    const reason = window.prompt("Reason for cancelling this Steam access:");
    if (!reason?.trim()) return;
    void runAction(() => cancelSteamEntitlement(access.id, reason), "Steam access cancelled.");
  };

  const doApprove = (payment: PendingSteamPayment) => {
    if (!window.confirm(`Confirm receipt of ${payment.amount.toLocaleString()} ETB from ${payment.customerName}? This activates Steam access.`)) return;
    void runAction(() => approveSteamPayment(payment.id), "Payment verified and Steam access activated.");
  };

  const doReject = (payment: PendingSteamPayment) => {
    const reason = window.prompt("Reason for rejecting this proof of payment:");
    if (!reason?.trim()) return;
    void runAction(() => rejectSteamPayment(payment.id, reason), "Payment marked failed; no Steam access was created.");
  };

  return (
    <div className="space-y-6 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Additional paid service</p><h2 className="text-2xl font-black">Steam / Sauna</h2></div>
        <button onClick={() => void refresh()} disabled={loading} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold hover:bg-zinc-700 disabled:opacity-50">Refresh</button>
      </header>
      {error && <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}
      {loading && <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">Loading Steam services and purchases…</div>}
      {!loading && !error && offerings.length === 0 && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">No Steam offerings are configured. An owner can create one after the database migration is applied.</div>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Active access", entitlements.filter(row => row.status === "Active" && row.paymentStatus === "PAID").length],
          ["Expired / cancelled", entitlements.filter(row => ["Expired", "Cancelled"].includes(row.status)).length],
          ...(canManageServices ? [["Paid revenue", `${revenue.toLocaleString()} ETB`]] : []),
        ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div><div className="mt-2 text-2xl font-black text-lime-300">{value}</div></div>)}
      </section>

      {canManageServices && <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-4 text-lg font-bold">Service offerings</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input className={inputClass} placeholder="Service name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
          <input className={inputClass} placeholder="Price (ETB)" type="number" min="0.01" step="0.01" value={form.price || ""} onChange={event => setForm({ ...form, price: Number(event.target.value) })} />
          <select className={inputClass} value={form.accessType} onChange={event => setForm({ ...form, accessType: event.target.value as SteamServiceOffering["accessType"] })}><option value="package">Package</option><option value="per-visit">Single visit</option></select>
          <input className={inputClass} placeholder="Validity (days)" type="number" min="1" value={form.durationDays} onChange={event => setForm({ ...form, durationDays: Number(event.target.value) })} />
          <input className={inputClass} placeholder="Usage limit (blank = none)" type="number" min="1" value={form.usageLimit ?? ""} onChange={event => setForm({ ...form, usageLimit: event.target.value ? Number(event.target.value) : null })} />
          <input className={inputClass} placeholder="Description" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />
          <label className="flex items-center gap-2 rounded-xl bg-zinc-800 px-3 py-2 text-sm"><input type="checkbox" checked={form.trackUsage} onChange={event => setForm({ ...form, trackUsage: event.target.checked })} />Track usage</label>
          <label className="flex items-center gap-2 rounded-xl bg-zinc-800 px-3 py-2 text-sm"><input type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} />Available to purchase</label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2"><button disabled={saving} onClick={saveOffering} className="rounded-xl bg-lime-400 px-4 py-2.5 font-bold text-zinc-950 disabled:opacity-50">{form.id ? "Save offering" : "Create offering"}</button>{form.id && <button onClick={() => setForm(blankOffering)} className="rounded-xl bg-zinc-800 px-4 py-2.5">Cancel edit</button>}</div>
        <div className="mt-4 divide-y divide-zinc-800">
          {offerings.map(offering => <div key={offering.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div><div className="font-semibold">{offering.name} <span className="text-lime-300">{offering.price.toLocaleString()} ETB</span></div><div className="text-xs text-zinc-500">{offering.durationDays} day(s) · {offering.usageLimit ?? "Unlimited"} uses · {offering.active ? "Active" : "Inactive"}</div></div>
            <button onClick={() => setForm(offering)} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700">Edit</button>
          </div>)}
        </div>
      </section>}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-4 text-lg font-bold">Reception purchase and access check-in</h3>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div><input className={inputClass} placeholder="Search customer name, code or phone" value={search} onChange={event => { setSearch(event.target.value); setCustomerId(""); }} /><div className="mt-1 max-h-44 overflow-y-auto">{customers.map(customer => <button key={customer.id} onClick={() => { setCustomerId(customer.id); setSearch(`${customer.name} · ${customer.code}`); }} className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800 ${customer.id === customerId ? "bg-zinc-800" : ""}`}>{customer.name} <span className="text-zinc-500">· {customer.code} · {customer.phone ?? "No phone"}</span></button>)}</div></div>
          <select className={inputClass} value={serviceId} onChange={event => setServiceId(event.target.value)}><option value="">Select active service</option>{activeOfferings.map(offering => <option key={offering.id} value={offering.id}>{offering.name} · {offering.price.toLocaleString()} ETB</option>)}</select>
          <button disabled={saving || !customerId || !serviceId} onClick={doPurchase} className="rounded-xl bg-cyan-300 px-4 py-2.5 font-bold text-zinc-950 disabled:opacity-50">Record cash sale</button>
        </div>
        {customerId && <div className="mt-4 space-y-2">{selectedCustomerAccess.length === 0 ? <p className="text-sm text-zinc-500">No Steam access history for this customer.</p> : selectedCustomerAccess.map(access => <div key={access.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-800/60 p-3 text-sm">
          <div><div className="font-semibold">{access.serviceName} · {access.status}</div><div className="text-xs text-zinc-400">{access.paymentStatus} via {access.paymentMethod} · {access.purchaseDate.slice(0, 10)} · Expires {access.endDate} · {access.usageLimit === null ? "Unlimited uses" : `${Math.max(0, access.usageLimit - access.usageCount)} uses remaining`}</div></div>
          <div className="flex gap-2"><button disabled={saving || access.status !== "Active" || access.paymentStatus !== "PAID" || (access.usageLimit !== null && access.usageCount >= access.usageLimit)} onClick={() => doCheckin(access)} className="rounded-lg bg-cyan-300 px-3 py-2 font-semibold text-zinc-950 disabled:opacity-40">Check in</button>{canManageServices && access.status === "Active" && <button disabled={saving} onClick={() => doCancel(access)} className="rounded-lg bg-red-500/20 px-3 py-2 text-red-200">Cancel access</button>}</div>
        </div>)}</div>}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-3 text-lg font-bold">Online proof verification</h3>
        <p className="mb-3 text-xs text-zinc-500">Verify the transfer against the gym&apos;s bank or wallet records before approving. Approval records the completed payment and entitlement in one database transaction.</p>
        {pendingPayments.length === 0 ? <p className="text-sm text-zinc-500">No Steam payment proofs are awaiting verification.</p> : <div className="space-y-2">{pendingPayments.map(payment => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-800/60 p-3 text-sm"><div><div className="font-semibold">{payment.customerName} · {payment.serviceName}</div><div className="text-xs text-zinc-400">{payment.amount.toLocaleString()} ETB · {payment.paymentMethod} · submitted {payment.createdAt.slice(0, 16).replace("T", " ")}</div></div><div className="flex gap-2"><button disabled={saving} onClick={() => doApprove(payment)} className="rounded-lg bg-emerald-400 px-3 py-2 font-semibold text-zinc-950 disabled:opacity-50">Verify payment</button><button disabled={saving} onClick={() => doReject(payment)} className="rounded-lg bg-red-500/20 px-3 py-2 text-red-200 disabled:opacity-50">Reject proof</button></div></div>)}</div>}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2"><h3 className="mr-auto text-lg font-bold">Purchase and access history</h3><input className={inputClass + " max-w-48"} aria-label="Search customer or service" placeholder="Customer or service" value={historySearch} onChange={event => setHistorySearch(event.target.value)} /><select aria-label="Filter access status" className={inputClass + " max-w-40"} value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="EXPIRED">Expired</option><option value="CANCELLED">Cancelled</option></select><select aria-label="Filter payment method" className={inputClass + " max-w-40"} value={methodFilter} onChange={event => setMethodFilter(event.target.value)}><option value="ALL">All methods</option><option value="CASH">Cash</option><option value="CBE_BIRR">CBE</option><option value="TELEBIRR">Telebirr</option></select><input aria-label="From date" className={inputClass + " max-w-40"} type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} /><input aria-label="To date" className={inputClass + " max-w-40"} type="date" value={toDate} onChange={event => setToDate(event.target.value)} /></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase text-zinc-500"><tr><th className="p-2">Customer</th><th className="p-2">Service</th><th className="p-2">Purchase</th><th className="p-2">Payment</th><th className="p-2">Valid through</th><th className="p-2">Uses</th><th className="p-2">Access</th></tr></thead><tbody className="divide-y divide-zinc-800">{visibleEntitlements.map(row => <tr key={row.id}><td className="p-2">{row.customerName}</td><td className="p-2">{row.serviceName}</td><td className="p-2">{row.price.toLocaleString()} {row.currency} · {row.purchaseDate.slice(0, 10)}</td><td className="p-2">{row.paymentStatus} / {row.paymentMethod}</td><td className="p-2">{row.startDate} – {row.endDate}</td><td className="p-2">{row.trackUsage ? `${row.usageCount}/${row.usageLimit ?? "∞"}` : "Not tracked"}</td><td className="p-2">{row.status}</td></tr>)}</tbody></table>{!loading && visibleEntitlements.length === 0 && <p className="p-6 text-center text-sm text-zinc-500">No matching Steam access records.</p>}</div>
      </section>
    </div>
  );
}
