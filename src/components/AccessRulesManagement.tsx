import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash, PencilSimple, GraduationCap, MoonStars, MusicNotes, Sparkle, Warning } from "@phosphor-icons/react";
import { useGym, addAudit, generateId, categoryLabelOf, planAppliesToCategory } from "../context/GymContext";
import { ACCESS_DAYS, ALL_CATEGORIES, ALL_DAYS } from "../constants";
import CategoryMembers from "./CategoryMembers";
import type { AccessRule, CustomerCategory } from "../types";
import { toast } from "sonner";

const SECTIONS = ["Categories", "Access rules", "Aerobics groups", "Student verification"] as const;
type Section = (typeof SECTIONS)[number];

export const CATEGORY_ICONS: Record<CustomerCategory, typeof Sparkle> = {
  REGULAR: Sparkle,
  STUDENT: GraduationCap,
  MUSLIM: MoonStars,
  AEROBICS: MusicNotes,
};

export const CATEGORY_COLORS: Record<CustomerCategory, string> = {
  REGULAR: "bg-lime-400/20 text-lime-400 border-lime-400/30",
  STUDENT: "bg-blue-400/20 text-blue-400 border-blue-400/30",
  MUSLIM: "bg-purple-400/20 text-purple-400 border-purple-400/30",
  AEROBICS: "bg-orange-400/20 text-orange-400 border-orange-400/30",
};

export default function AccessRulesManagement() {
  const [section, setSection] = useState<Section>("Categories");
  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SECTIONS.map(s => (
          <button key={s} onClick={() => setSection(s)} className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${section === s ? "bg-lime-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>{s}</button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
          {section === "Categories" && <CategoriesSection />}
          {section === "Access rules" && <RulesSection />}
          {section === "Aerobics groups" && <CategoryMembers mode="groups" />}
          {section === "Student verification" && <CategoryMembers mode="students" />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function CategoriesSection() {
  const { state, dispatch } = useGym();
  const actor = state.currentUser?.name || "Owner";

  const save = (category: CustomerCategory, label: string, description: string) => {
    if (!label.trim()) { toast.error("Label is required"); return; }
    dispatch({ type: "UPDATE_CATEGORY_LABEL", payload: { category, label: label.trim(), description: description.trim() } });
    addAudit(dispatch, "Category updated", actor, `${category} → ${label.trim()}`);
    toast.success("Category updated");
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {state.categoryLabels.map(item => {
        const Icon = CATEGORY_ICONS[item.category];
        const count = state.members.filter(m => (m.category || "REGULAR") === item.category).length;
        const plans = state.plans.filter(p => planAppliesToCategory(p, item.category));
        const rules = state.accessRules.filter(r => r.category === item.category && r.active);
        return (
          <div key={item.category} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon weight="fill" className="w-6 h-6 text-lime-400" />
                <h3 className="font-bold">{item.label}</h3>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border font-mono ${CATEGORY_COLORS[item.category]}`}>{item.category}</span>
            </div>
            <CategoryEditor item={item} onSave={save} />
            <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
              <span className="bg-zinc-800 rounded-full px-2 py-1">{count} member(s)</span>
              <span className="bg-zinc-800 rounded-full px-2 py-1">{plans.length} eligible plan(s)</span>
              <span className="bg-zinc-800 rounded-full px-2 py-1">{rules.length} active rule(s)</span>
            </div>
          </div>
        );
      })}
      <div className="md:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 text-sm text-zinc-400">
        New registration without a specified category: <span className="text-lime-400 font-semibold">Standard (REGULAR)</span> is applied by default.
      </div>
    </div>
  );
}

function CategoryEditor({ item, onSave }: { item: { category: CustomerCategory; label: string; description: string }; onSave: (c: CustomerCategory, l: string, d: string) => void }) {
  const [label, setLabel] = useState(item.label);
  const [description, setDescription] = useState(item.description);
  return (
    <div className="space-y-2">
      <input value={label} onChange={e => setLabel(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-lime-400/50" />
      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm resize-none focus:outline-none focus:border-lime-400/50" />
      <button onClick={() => onSave(item.category, label, description)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">Save label</button>
    </div>
  );
}

function RulesSection() {
  const { state, dispatch } = useGym();
  const actor = state.currentUser?.name || "Owner";
  const [editing, setEditing] = useState<AccessRule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const empty = { category: "REGULAR" as CustomerCategory, days: [ALL_DAYS] as string[], startTime: "05:00", endTime: "22:00", description: "", active: true };
  const [form, setForm] = useState(empty);

  const openNew = () => { setEditing(null); setForm(empty); setShowForm(true); };
  const openEdit = (rule: AccessRule) => { setEditing(rule); setForm({ category: rule.category, days: rule.days, startTime: rule.startTime, endTime: rule.endTime, description: rule.description, active: rule.active }); setShowForm(true); };
  const toggleDay = (day: string) => setForm({ ...form, days: form.days.includes(day) ? form.days.filter(d => d !== day) : [...form.days, day] });

  const save = () => {
    if (form.days.length === 0) { toast.error("Select at least one day"); return; }
    if (form.startTime >= form.endTime) { toast.error("End time must be after start time"); return; }
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    const rule: AccessRule = editing
      ? { ...editing, category: form.category, days: form.days, startTime: form.startTime, endTime: form.endTime, description: form.description.trim(), active: form.active }
      : { id: generateId("ar"), category: form.category, days: form.days, startTime: form.startTime, endTime: form.endTime, description: form.description.trim(), active: form.active };
    dispatch({ type: editing ? "UPDATE_ACCESS_RULE" : "ADD_ACCESS_RULE", payload: rule });
    addAudit(dispatch, editing ? "Access rule updated" : "Access rule created", actor, `${rule.category} · ${rule.days.join(", ")} ${rule.startTime}-${rule.endTime}`);
    toast.success(editing ? "Rule updated" : "Rule created");
    setShowForm(false); setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-lg">Access rules by category</h3>
        <button onClick={openNew} className="bg-lime-400 text-zinc-950 px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-lime-300"><Plus className="w-4 h-4" /> New rule</button>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800/50"><tr><th className="text-left px-4 py-3 font-semibold">Category</th><th className="text-left px-4 py-3 font-semibold">Days</th><th className="text-left px-4 py-3 font-semibold">Time slot</th><th className="text-left px-4 py-3 font-semibold">Description</th><th className="text-left px-4 py-3 font-semibold">Status</th><th className="text-left px-4 py-3 font-semibold">Actions</th></tr></thead>
            <tbody>
              {state.accessRules.map(rule => (
                <tr key={rule.id} className="border-t border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full border font-semibold ${CATEGORY_COLORS[rule.category]}`}>{categoryLabelOf(state, rule.category)}</span></td>
                  <td className="px-4 py-3 text-zinc-400">{rule.days.join(", ")}</td>
                  <td className="px-4 py-3 font-mono text-xs">{rule.startTime} – {rule.endTime}</td>
                  <td className="px-4 py-3 text-zinc-300 max-w-xs">{rule.description}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => dispatch({ type: "UPDATE_ACCESS_RULE", payload: { ...rule, active: !rule.active } })} className={`text-xs px-2 py-1 rounded-full font-semibold ${rule.active ? "bg-lime-400/20 text-lime-400" : "bg-zinc-700 text-zinc-400"}`}>{rule.active ? "Active" : "Inactive"}</button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => openEdit(rule)} className="text-lime-400 hover:text-lime-300"><PencilSimple className="w-4 h-4" /></button>
                      <button onClick={() => { dispatch({ type: "DELETE_ACCESS_RULE", payload: rule.id }); toast.success("Rule deleted"); }} className="text-red-400 hover:text-red-300"><Trash className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {state.accessRules.length === 0 && <div className="p-8 text-center text-zinc-500">No access rule defined</div>}
      </div>
      <p className="text-xs text-zinc-500 flex items-center gap-2"><Warning className="w-4 h-4 text-yellow-400" /> Rules are evaluated automatically on every check-in at reception.</p>
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bold mb-4">{editing ? "Edit rule" : "New access rule"}</h3>
              <div className="space-y-3">
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as CustomerCategory })} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none">
                  {state.categoryLabels.filter(c => c.isActive !== false).map(c => <option key={c.category} value={c.category}>{c.label}</option>)}
                </select>
                <div>
                  <label className="text-xs text-zinc-500 block mb-2">Allowed days</label>
                  <div className="flex flex-wrap gap-2">
                    {ACCESS_DAYS.map(d => (
                      <button key={d} type="button" onClick={() => toggleDay(d)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${form.days.includes(d) ? "bg-lime-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>{d}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-zinc-500 block mb-1">Start</label><input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none" /></div>
                  <div><label className="text-xs text-zinc-500 block mb-1">End</label><input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none" /></div>
                </div>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Description shown to reception staff" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 resize-none focus:outline-none focus:border-lime-400/50" />
                <label className="flex items-center gap-3 cursor-pointer text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="w-5 h-5 accent-lime-400" /> Rule active</label>
                <button onClick={save} className="w-full bg-lime-400 text-zinc-950 font-bold py-3 rounded-xl hover:bg-lime-300">{editing ? "Update" : "Create rule"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}