import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, MagnifyingGlass, Lightning, CheckCircle, User, Plus, Envelope, Clock, Warning, PaperPlaneTilt, GraduationCap, MoonStars, MusicNotes, Sparkle, Prohibit, Lockers } from "@phosphor-icons/react";
import { useGym, useT, formatETB, generateId, sendEmail, addAudit, computeMemberStatus, evaluateAccess, planAppliesToCategory, categoryLabelOf, memberActiveLocker } from "../context/GymContext";
import type { AccessDecision, CustomerCategory, Member, Visit } from "../types";
import { toast } from "sonner";
import { EMAIL_TEMPLATES, ALL_CATEGORIES } from "../constants";
import LockersManagement from "./LockersManagement";
import SteamManagement from "./SteamManagement";

const CATEGORY_ICONS: Record<CustomerCategory, typeof Sparkle> = { REGULAR: Sparkle, STUDENT: GraduationCap, MUSLIM: MoonStars, AEROBICS: MusicNotes };
function CategoryBadge({ category }: { category: CustomerCategory }) {
  const { state } = useGym();
  const Icon = CATEGORY_ICONS[category];
  return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-300"><Icon weight="fill" className="w-3 h-3 text-lime-400" />{categoryLabelOf(state, category)}</span>;
}

function LockerBadge({ memberId }: { memberId: string }) {
  const { state } = useGym();
  const held = memberActiveLocker(state, memberId);
  if (!held) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-amber-400/15 text-amber-400">
      <Lockers weight="fill" className="w-3 h-3" />{held.locker.number}
    </span>
  );
}

const TABS = ["checkin", "lockers", "steam", "register", "communication"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  checkin: "staff.tab.checkin",
  lockers: "staff.tab.lockers",
  steam: "staff.tab.steam",
  register: "staff.tab.register",
  communication: "staff.tab.communication",
};

export default function StaffPortal() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("checkin");

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <Users weight="fill" className="w-6 h-6 text-lime-400" />
          <h1 className="text-2xl font-black uppercase tracking-tight">{t("staff.title")}</h1>
        </div>
        <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
          {TABS.map(key => (
            <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${tab === key ? "bg-lime-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>{t(TAB_LABEL[key])}</button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {tab === "checkin" && <CheckInView />}
            {tab === "lockers" && <LockersManagement />}
            {tab === "steam" && <SteamView />}
            {tab === "register" && <RegisterView />}
            {tab === "communication" && <CommunicateView />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function CheckInView() {
  const { state, dispatch } = useGym();
  const t = useT();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CustomerCategory | "ALL">("ALL");
  const [lastCheckIn, setLastCheckIn] = useState<{ member: Member; time: string } | null>(null);
  const [refused, setRefused] = useState<{ member: Member; decision: AccessDecision } | null>(null);
  const actor = state.currentUser?.name || "Reception";

  const results = state.members.filter(m => {
    if (!search) return [];
    if (categoryFilter !== "ALL" && (m.category || "REGULAR") !== categoryFilter) return false;
    const q = search.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.phone.includes(q) || m.memberId.toLowerCase().includes(q);
  });

  const recordDeniedAudit = (member: Member, decision: AccessDecision) => {
    addAudit(dispatch, "Access denied", actor, `${member.name} · ${decision.message}`);
  };

  const recordVisit = (member: Member, accessStatus: "allowed" | "override") => {
    const category = member.category || "REGULAR";
    const visit: Visit = { id: generateId("v"), memberId: member.id, timestamp: new Date().toISOString(), checkedInBy: actor, category, accessStatus };
    dispatch({ type: "ADD_VISIT", payload: visit });
    dispatch({ type: "UPDATE_MEMBER", payload: { ...member, lastVisit: new Date().toISOString() } });
    addAudit(dispatch, accessStatus === "override" ? "Check-in (override)" : "Check-in", actor, `${member.name} · ${categoryLabelOf(state, category)}`);
    setLastCheckIn({ member, time: new Date().toLocaleTimeString() });
    setRefused(null);
    setSearch("");
    toast.success(t("staff.checkedIn", { name: member.name }));
  };

  const handleCheckIn = (member: Member) => {
    if (member.category === "STUDENT" && member.studentVerified !== true) {
      const reason = "Student verification is pending; reception must approve student documents before gym access.";
      addAudit(dispatch, "Access denied", actor, `${member.name} · ${reason}`);
      toast.error(reason);
      return;
    }
    const status = computeMemberStatus(member, state.settings);
    if (status === "expired" || status === "blocked") {
      toast.error(t("staff.expiredCannot", { name: member.name, status: t(`status.${status}`).toLowerCase() }));
      return;
    }
    const decision = evaluateAccess(member, state.accessRules, state.aerobicsGroups, new Date());
    if (!decision.allowed) {
      recordDeniedAudit(member, decision);
      setRefused({ member, decision });
      setSearch("");
      toast.error(`${t("staff.accessDenied")} — ${member.name}`);
      return;
    }
    recordVisit(member, "allowed");
  };

  const statusBadge = (m: Member) => {
    const s = computeMemberStatus(m, state.settings);
    const map: Record<string, string> = { active: "bg-lime-400/20 text-lime-400", expiring: "bg-yellow-400/20 text-yellow-400", expired: "bg-red-400/20 text-red-400", inactive: "bg-zinc-400/20 text-zinc-400", blocked: "bg-purple-400/20 text-purple-400" };
    return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${map[s]}`}>{t(`status.${s}`)}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="relative">
        <MagnifyingGlass className="w-6 h-6 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("staff.searchPlaceholder")} className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-white text-lg placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" autoFocus />
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setCategoryFilter("ALL")} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${categoryFilter === "ALL" ? "bg-lime-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>{t("staff.allCategories")}</button>
        {state.categoryLabels.map(c => (
          <button key={c.category} onClick={() => setCategoryFilter(c.category)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${categoryFilter === c.category ? "bg-lime-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>{c.label}</button>
        ))}
      </div>
      {refused && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Prohibit weight="fill" className="w-8 h-8 text-red-400 shrink-0" />
            <div>
              <div className="font-bold text-red-400">{t("staff.accessDenied")} — {refused.member.name}</div>
              <div className="text-sm text-zinc-400">{refused.decision.message}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => recordVisit(refused.member, "override")} className="flex-1 bg-lime-400 text-zinc-950 font-bold text-sm py-2.5 rounded-xl hover:bg-lime-300">{t("staff.allowOverride")}</button>
            <button onClick={() => setRefused(null)} className="flex-1 bg-zinc-800 text-zinc-200 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-700">{t("common.cancel")}</button>
          </div>
        </div>
      )}
      {lastCheckIn && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-lime-400/10 border border-lime-400/30 rounded-2xl p-4 flex items-center gap-4">
          <CheckCircle weight="fill" className="w-8 h-8 text-lime-400" />
          <div><div className="font-bold text-lime-400">{t("staff.checkedIn", { name: lastCheckIn.member.name })}</div><div className="text-sm text-zinc-400">{lastCheckIn.time} | {lastCheckIn.member.memberId}</div></div>
        </motion.div>
      )}
      {search && results.length > 0 && (
        <div className="space-y-2">
          {results.map(m => (
            <motion.div key={m.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center"><User className="w-6 h-6 text-zinc-400" /></div>
                <div>
                  <div className="font-bold">{m.name}</div>
                  <div className="text-sm text-zinc-500 flex items-center gap-3"><span>{m.memberId}</span><span>{m.phone}</span>{statusBadge(m)}<CategoryBadge category={m.category || "REGULAR"} /><LockerBadge memberId={m.id} /></div>
                </div>
              </div>
              <button onClick={() => handleCheckIn(m)} disabled={computeMemberStatus(m, state.settings) === "expired" || computeMemberStatus(m, state.settings) === "blocked"}
                className="bg-lime-400 text-zinc-950 px-6 py-3 rounded-xl font-bold text-sm hover:bg-lime-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.95] flex items-center gap-2">
                <Lightning weight="fill" className="w-4 h-4" /> {t("staff.checkIn")}
              </button>
            </motion.div>
          ))}
        </div>
      )}
      {search && results.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          <Warning className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
          <p className="font-semibold">{t("staff.noMembersFound")}</p>
          <p className="text-sm">{t("staff.noMembersHint")}</p>
        </div>
      )}
      {!search && (
        <div className="text-center py-16 text-zinc-600">
          <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-semibold">{t("staff.searchPrompt")}</p>
          <p className="text-sm mt-2">{t("staff.searchPromptHint")}</p>
        </div>
      )}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h3 className="font-bold mb-3 flex items-center gap-2"><Clock className="w-5 h-5 text-lime-400" /> {t("staff.todayCheckIns")}</h3>
        <div className="space-y-2">
          {state.visits.slice().reverse().filter(v => v.timestamp.startsWith(new Date().toISOString().split("T")[0])).slice(0, 8).map(v => {
            const m = state.members.find(mm => mm.id === v.memberId);
            return <div key={v.id} className="flex justify-between items-center text-sm py-2 border-b border-zinc-800/50"><span className="font-medium flex items-center gap-2">{m?.name || t("staff.unknown")}<CategoryBadge category={v.category || m?.category || "REGULAR"} />{v.accessStatus === "override" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400 font-bold">{t("staff.override")}</span>}</span><span className="text-zinc-500">{new Date(v.timestamp).toLocaleTimeString()}</span></div>;
          })}
          {state.visits.filter(v => v.timestamp.startsWith(new Date().toISOString().split("T")[0])).length === 0 && <p className="text-sm text-zinc-500">{t("staff.noCheckIns")}</p>}
        </div>
      </div>
    </div>
  );
}

function emptyForm() {
  return { name: "", phone: "", email: "", planId: "", emergencyContact: "", emergencyPhone: "", medicalNotes: "", category: "REGULAR" as CustomerCategory, studentId: "", institution: "" };
}

function RegisterView() {
  const { state, dispatch } = useGym();
  const t = useT();
  const [form, setForm] = useState(emptyForm());
  const actor = state.currentUser?.name || "Reception";
  const applicablePlans = state.plans.filter(p => p.active && planAppliesToCategory(p, form.category));

  const handleRegister = () => {
    if (!form.name || !form.phone || !form.email) { toast.error("Name, phone and e-mail are required"); return; }
    const dupPhone = state.members.find(m => m.phone === form.phone);
    const dupEmail = state.members.find(m => m.email === form.email);
    if (dupPhone) { toast.error(`Phone number already registered: ${dupPhone.name}`); return; }
    if (dupEmail) { toast.error(`E-mail already registered: ${dupEmail.name}`); return; }
    const plan = state.plans.find(p => p.id === form.planId);
    if (!plan) { toast.error("Please choose a membership plan that matches the category"); return; }
    const newMember: Member = {
      id: generateId("m"), name: form.name, phone: form.phone, email: form.email,
      memberId: `PP-${String(state.members.length + 1).padStart(3, "0")}`,
      planId: form.planId, joinDate: new Date().toISOString().split("T")[0],
      expiryDate: new Date(Date.now() + plan.durationDays * 86400000).toISOString().split("T")[0],
      status: "active", lastVisit: null, emergencyContact: form.emergencyContact,
      emergencyPhone: form.emergencyPhone, medicalNotes: form.medicalNotes,
      emailNotifications: true, balanceDue: 0,
      category: form.category,
      studentId: form.category === "STUDENT" ? form.studentId : undefined,
      institution: form.category === "STUDENT" ? form.institution : undefined,
      studentVerified: form.category === "STUDENT" ? false : undefined,
    };
    dispatch({ type: "ADD_MEMBER", payload: newMember });
    sendEmail(state, dispatch, form.email, form.name, "Welcome to Power Plus Gym!", `Hi ${form.name}, your ${plan.name} membership (${categoryLabelOf(state, form.category)} category) is active until ${newMember.expiryDate}.`, "welcome");
    addAudit(dispatch, "Member registered", actor, `${form.name} · ${categoryLabelOf(state, form.category)} · ${plan.name}`);
    toast.success(`${form.name} registered successfully! Welcome e-mail sent.`);
    setForm(emptyForm());
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2"><Plus className="w-5 h-5 text-lime-400" /> {t("staff.registerTitle")}</h3>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{t("member.categoryLabel")}</label>
          <select value={form.category} onChange={e => {
            const category = e.target.value as CustomerCategory;
            const next = state.plans.find(p => p.active && planAppliesToCategory(p, category));
            setForm({ ...form, category, planId: next ? next.id : "" });
          }} data-testid="staff-category-select" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-lime-400/50">
            {ALL_CATEGORIES.map(c => <option key={c} value={c}>{categoryLabelOf(state, c)}</option>)}
          </select>
        </div>
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name *" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />
        <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone number *" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />
        <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="E-mail address *" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />
        {form.category === "STUDENT" && (
          <div className="grid grid-cols-2 gap-3">
            <input value={form.studentId} onChange={e => setForm({ ...form, studentId: e.target.value })} placeholder="Student ID number" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />
            <input value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })} placeholder="Institution" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />
          </div>
        )}
        <select value={form.planId} onChange={e => setForm({ ...form, planId: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-lime-400/50">
          <option value="">Choose a membership plan...</option>
          {applicablePlans.map(p => <option key={p.id} value={p.id}>{p.name} - {formatETB(p.price)}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <input value={form.emergencyContact} onChange={e => setForm({ ...form, emergencyContact: e.target.value })} placeholder="Emergency contact" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />
          <input value={form.emergencyPhone} onChange={e => setForm({ ...form, emergencyPhone: e.target.value })} placeholder="Emergency phone" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />
        </div>
        <textarea value={form.medicalNotes} onChange={e => setForm({ ...form, medicalNotes: e.target.value })} placeholder="Medical notes (optional)" rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50 resize-none" />
        <button onClick={handleRegister} className="w-full bg-lime-400 text-zinc-950 font-bold py-3.5 rounded-xl hover:bg-lime-300 transition-colors active:scale-[0.98]">Register member</button>
      </div>
    </div>
  );
}

function SteamView() {
  return <SteamManagement canManageServices={false} />;
}

function CommunicateView() {
  const { state, dispatch } = useGym();
  const [selectedMember, setSelectedMember] = useState("");
  const [template, setTemplate] = useState(0);
  const [customMsg, setCustomMsg] = useState("");
  const [sending, setSending] = useState(false);

  const member = state.members.find(m => m.id === selectedMember);
  const tmpl = EMAIL_TEMPLATES[template];

  const handleSend = () => {
    if (!member) { toast.error("Select a member"); return; }
    setSending(true);
    setTimeout(() => {
      const body = customMsg || (tmpl.body.replace("{name}", member.name).replace("{amount}", formatETB(member.balanceDue)).replace("{message}", "See you soon!"));
      sendEmail(state, dispatch, member.email, member.name, tmpl.subject, body, "manual");
      addAudit(dispatch, "E-mail sent", state.currentUser?.name || "Reception", `To ${member.name}: ${tmpl.subject}`);
      toast.success(`E-mail sent to ${member.name}`);
      setSending(false);
      setCustomMsg("");
    }, 800);
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2"><PaperPlaneTilt className="w-5 h-5 text-lime-400" /> Send an e-mail to a member</h3>
        <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none">
          <option value="">Select a member...</option>
          {state.members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.memberId}) — {categoryLabelOf(state, m.category || "REGULAR")}</option>)}
        </select>
        <select value={template} onChange={e => setTemplate(Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none">
          {EMAIL_TEMPLATES.map((t, i) => <option key={i} value={i}>{t.name}</option>)}
        </select>
        <textarea value={customMsg} onChange={e => setCustomMsg(e.target.value)} placeholder={`Custom message (or use the template)...`} rows={4} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50 resize-none" />
        {member && (
          <div className="bg-zinc-800/50 rounded-xl p-4 text-sm space-y-1">
            <div className="text-zinc-500">Preview:</div>
            <div className="font-semibold">To: {member.name} &lt;{member.email}&gt; · {categoryLabelOf(state, member.category || "REGULAR")}</div>
            <div className="font-semibold">Subject: {tmpl.subject}</div>
            <div className="text-zinc-400">{customMsg || tmpl.body.replace("{name}", member.name).replace("{amount}", formatETB(member.balanceDue)).replace("{message}", "...")}</div>
          </div>
        )}
        <button onClick={handleSend} disabled={!member || sending} className="w-full bg-lime-400 text-zinc-950 font-bold py-3 rounded-xl hover:bg-lime-300 transition-colors disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2">
          {sending ? "Sending..." : <><Envelope className="w-5 h-5" /> Send e-mail</>}
        </button>
      </div>
    </div>
  );
}
