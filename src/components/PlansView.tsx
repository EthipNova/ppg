import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lightning, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useGym, formatETB, addAudit, planCategoryText } from "../context/GymContext";
import type { CustomerCategory, Plan } from "../types";
import { createPlan, updatePlan, deletePlan } from "../services/plans";
import { toast } from "sonner";

const INPUT = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50";
const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-6";

type FormState = {
  name: string;
  price: number;
  durationDays: number;
  description: string;
  perks: string;
  applyAll: boolean;
  cats: CustomerCategory[];
};

const emptyForm = (): FormState => ({
  name: "",
  price: 0,
  durationDays: 30,
  description: "",
  perks: "",
  applyAll: true,
  cats: [],
});

export function PlansView() {
  const { state, dispatch } = useGym();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const toggleCat = (cat: CustomerCategory) => {
    setForm(f => ({ ...f, cats: f.cats.includes(cat) ? f.cats.filter(c => c !== cat) : [...f.cats, cat] }));
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowForm(true); };

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setForm({
      name: plan.name,
      price: plan.price,
      durationDays: plan.durationDays,
      description: plan.description || "",
      perks: plan.perks.join(", "),
      applyAll: plan.applicableCategories === "ALL",
      cats: plan.applicableCategories === "ALL" ? [] : plan.applicableCategories,
    });
    setShowForm(true);
  };

  const savePlan = async () => {
    if (!form.name.trim() || form.price <= 0) {
      toast.error("Enter a name and a valid price");
      return;
    }
    if (!form.applyAll && form.cats.length === 0) {
      toast.error("Select at least one customer category");
      return;
    }

    const base = {
      name: form.name.trim(),
      price: Number(form.price),
      durationDays: Number(form.durationDays) || 30,
      description: form.description.trim(),
      perks: form.perks.split(",").map(s => s.trim()).filter(Boolean),
      applicableCategories: (form.applyAll ? "ALL" : form.cats) as Plan["applicableCategories"],
    };

    try {
      if (editing) {
        const updated: Plan = { ...editing, ...base };
        await updatePlan(updated);
        dispatch({ type: "UPDATE_PLAN", payload: updated });
        addAudit(dispatch, "Plan updated", state.currentUser?.name || "Owner", `${updated.name} · ${formatETB(updated.price)} · ${planCategoryText(state, updated)}`);
        toast.success("Plan updated successfully");
      } else {
        const created = await createPlan(base);
        dispatch({ type: "ADD_PLAN", payload: created });
        addAudit(dispatch, "Plan created", state.currentUser?.name || "Owner", `${created.name} · ${formatETB(created.price)} · ${planCategoryText(state, created)}`);
        toast.success("Plan created successfully");
      }
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm());
    } catch (err: unknown) {
      console.error("Failed to save plan:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save plan");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3">
        <div>
          <h2 className="text-xl font-bold">Membership plans</h2>
          <p className="text-sm text-zinc-500">Each plan is linked to the customer categories allowed to subscribe to it.</p>
        </div>
        <button onClick={openCreate} className="bg-lime-400 text-zinc-950 px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-lime-300 whitespace-nowrap"><Plus className="w-4 h-4" /> New plan</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {state.plans.map(plan => (
          <div key={plan.id} className={`${CARD} ${plan.active ? "" : "opacity-50"}`}>
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-bold text-lg">{plan.name}</h3>
              <span className={`text-xs px-2 py-1 rounded-full ${plan.active ? "bg-lime-400/20 text-lime-400" : "bg-zinc-700 text-zinc-400"}`}>{plan.active ? "Active" : "Inactive"}</span>
            </div>
            <div className="text-2xl font-black text-lime-400 mb-1">{formatETB(plan.price)}</div>
            <div className="text-sm text-zinc-500 mb-2">{plan.durationDays} days</div>
            {plan.description && <p className="text-xs text-zinc-400 mb-3 italic">{plan.description}</p>}
            <div className="text-xs mb-3 flex items-center gap-2 text-zinc-300">
              <Lightning weight="fill" className="w-4 h-4 text-lime-400 shrink-0" />
              <span><strong className="text-zinc-400">Category:</strong> {planCategoryText(state, plan)}</span>
            </div>
            <div className="flex flex-wrap gap-1 mb-4">{plan.perks.map(p => <span key={p} className="text-xs bg-zinc-800 px-2 py-1 rounded">{p}</span>)}</div>
            <div className="flex items-center gap-4 text-sm">
              <button onClick={() => openEdit(plan)} className="text-zinc-400 hover:text-white flex items-center gap-1"><PencilSimple className="w-4 h-4" /> Edit</button>
              <button
                onClick={async () => {
                  try {
                    const updated = { ...plan, active: !plan.active };
                    await updatePlan(updated);
                    dispatch({ type: "UPDATE_PLAN", payload: updated });
                    toast.success(plan.active ? "Plan deactivated" : "Plan activated");
                  } catch (err: any) {
                    toast.error(err?.message || "Failed to toggle plan status");
                  }
                }}
                className="text-zinc-400 hover:text-white"
              >
                {plan.active ? "Deactivate" : "Activate"}
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm(`Are you sure you want to delete "${plan.name}"? This action cannot be undone.`)) return;
                  try {
                    await deletePlan(plan.id);
                    dispatch({ type: "DELETE_PLAN", payload: plan.id });
                    addAudit(dispatch, "Plan deleted", state.currentUser?.name || "Owner", plan.name);
                    toast.success("Plan deleted successfully");
                  } catch (err: any) {
                    toast.error(err?.message || "Failed to delete plan");
                  }
                }}
                className="text-red-400/70 hover:text-red-400 flex items-center gap-1 ml-auto"
              >
                <Trash className="w-4 h-4" /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className={`${CARD} w-full max-w-md max-h-[85vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bold mb-4">{editing ? "Edit plan" : "New plan"}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Plan Name</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Monthly Membership" className={INPUT} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">Price (ETB)</label>
                    <input type="number" value={form.price || ""} onChange={e => setForm({ ...form, price: Number(e.target.value) })} placeholder="Price (Br)" className={INPUT} />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">Duration (days)</label>
                    <input type="number" value={form.durationDays || ""} onChange={e => setForm({ ...form, durationDays: Number(e.target.value) })} placeholder="Duration (days)" className={INPUT} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Description</label>
                  <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Plan description (optional, visible on public site)" rows={2} className={`${INPUT} resize-none`} />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Perks (comma-separated)</label>
                  <textarea value={form.perks} onChange={e => setForm({ ...form, perks: e.target.value })} placeholder="e.g. Full access, Lockers, Free water" rows={2} className={`${INPUT} resize-none`} />
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Eligible categories</div>
                  <label className="flex items-center gap-2 text-sm text-zinc-200 cursor-pointer">
                    <input type="checkbox" checked={form.applyAll} onChange={e => setForm({ ...form, applyAll: e.target.checked })} className="accent-lime-400" />
                    All categories
                  </label>
                  {!form.applyAll && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {state.categoryLabels.map(cat => (
                        <button
                          key={cat.category}
                          type="button"
                          onClick={() => toggleCat(cat.category)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            form.cats.includes(cat.category)
                              ? "bg-lime-400 text-zinc-950 font-bold"
                              : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={savePlan} className="w-full bg-lime-400 text-zinc-950 font-bold py-3 rounded-xl hover:bg-lime-300 transition-colors">{editing ? "Update plan" : "Create plan"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}