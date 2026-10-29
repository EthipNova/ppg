import { useState, useEffect, useCallback } from "react";
import { Users, Clock, CheckCircle, Plus, Trash, GraduationCap, MusicNotes, ShieldCheck, Calendar } from "@phosphor-icons/react";
import { useGym, addAudit, generateId } from "../context/GymContext";
import { ACCESS_DAYS, ALL_DAYS } from "../constants";
import type { AerobicsGroup } from "../types";
import { toast } from "sonner";
import { fetchStudentVerificationQueue, setStudentVerification, fetchStudentPaymentReviewQueue, reviewStudentMembershipPayment } from "../services/studentMembershipService";

/** Phase 2 sections: aerobics groups + student document verification. */
export default function CategoryMembers({ mode }: { mode: "groups" | "students" }) {
  return mode === "students" ? <StudentsSection /> : <GroupsSection />;
}

function GroupsSection() {
  const { state, dispatch } = useGym();
  const actor = state.currentUser?.name || "Owner";
  const [form, setForm] = useState({ name: "", trainerId: state.trainers[0]?.id || "", timeSlot: "18:00 â€“ 19:00", capacity: 20, days: ["Monday", "Wednesday"] as string[] });

  const addGroup = () => {
    if (!form.name.trim()) { toast.error("Group name is required"); return; }
    if (form.days.length === 0) { toast.error("Select at least one class day"); return; }
    const trainer = state.trainers.find(t => t.id === form.trainerId);
    const group: AerobicsGroup = { id: generateId("agp"), name: form.name.trim(), days: form.days, timeSlot: form.timeSlot, trainerId: form.trainerId, trainerName: trainer?.name || "Coach to be assigned", capacity: form.capacity, memberIds: [] };
    dispatch({ type: "ADD_AEROBICS_GROUP", payload: group });
    addAudit(dispatch, "Aerobics group created", actor, `${group.name} Â· ${group.days.join(", ")}`);
    toast.success("Group created");
    setForm({ ...form, name: "" });
  };

  const toggleMember = (group: AerobicsGroup, memberId: string) => {
    const enrolled = group.memberIds.includes(memberId);
    const memberIds = enrolled ? group.memberIds.filter(id => id !== memberId) : [...group.memberIds, memberId];
    if (!enrolled && memberIds.length > group.capacity) { toast.error("Group capacity reached"); return; }
    dispatch({ type: "UPDATE_AEROBICS_GROUP", payload: { ...group, memberIds } });
    const member = state.members.find(m => m.id === memberId);
    if (member) dispatch({ type: "UPDATE_MEMBER", payload: { ...member, aerobicsGroupId: enrolled ? undefined : group.id } });
    addAudit(dispatch, "Aerobics group enrollment", actor, `${member?.name || memberId} ${enrolled ? "removed from" : "enrolled in"} ${group.name}`);
    toast.success(enrolled ? "Member removed from group" : "Member enrolled in group");
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-3">
        <h3 className="font-bold flex items-center gap-2"><MusicNotes weight="fill" className="w-5 h-5 text-lime-400" /> New aerobics group</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Group name" className="md:col-span-2 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />
          <input value={form.timeSlot} onChange={e => setForm({ ...form, timeSlot: e.target.value })} placeholder="Time slot (18:00 â€“ 19:00)" className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none" />
          <input type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: Number(e.target.value) })} placeholder="Capacity" className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none" />
          <select value={form.trainerId} onChange={e => setForm({ ...form, trainerId: e.target.value })} className="md:col-span-2 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none">
            {state.trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="md:col-span-2 flex flex-wrap gap-2">
            {ACCESS_DAYS.filter(d => d !== ALL_DAYS).map(d => (
              <button key={d} type="button" onClick={() => setForm({ ...form, days: form.days.includes(d) ? form.days.filter(x => x !== d) : [...form.days, d] })} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${form.days.includes(d) ? "bg-lime-400 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}>{d.slice(0, 3)}</button>
            ))}
          </div>
        </div>
        <button onClick={addGroup} className="bg-lime-400 text-zinc-950 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-lime-300 flex items-center gap-2"><Plus className="w-4 h-4" /> Create group</button>
      </div>

      {state.aerobicsGroups.map(group => {
        const eligible = state.members.filter(m => (m.category || "REGULAR") === "AEROBICS");
        return (
          <div key={group.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg">{group.name}</h3>
                <div className="text-sm text-zinc-500 flex flex-wrap items-center gap-3 mt-1">
                  <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {group.days.join(", ")}</span>
                  <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {group.timeSlot}</span>
                  <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {group.memberIds.length}/{group.capacity}</span>
                  <span className="flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> {group.trainerName}</span>
                </div>
              </div>
              <button onClick={() => { dispatch({ type: "DELETE_AEROBICS_GROUP", payload: group.id }); toast.success("Group deleted"); }} className="text-red-400 hover:text-red-300"><Trash className="w-5 h-5" /></button>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-zinc-400 mb-2">Members in the Aerobics category</h4>
              <div className="flex flex-wrap gap-2">
                {eligible.map(m => {
                  const enrolled = group.memberIds.includes(m.id);
                  return (
                    <button key={m.id} onClick={() => toggleMember(group, m.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 transition-colors ${enrolled ? "bg-orange-400/20 text-orange-400 border border-orange-400/30" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                      {enrolled ? <CheckCircle weight="fill" className="w-3 h-3" /> : <Plus className="w-3 h-3" />} {m.name}
                    </button>
                  );
                })}
                {eligible.length === 0 && <span className="text-sm text-zinc-500">No Aerobics members registered.</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StudentsSection() {
  const { state, dispatch } = useGym();
  const actor = state.currentUser?.name || "Owner";
  const [students, setStudents] = useState<Awaited<ReturnType<typeof fetchStudentVerificationQueue>>>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setStudents(await fetchStudentVerificationQueue()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load student verification queue."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const decide = async (student: (typeof students)[number], status: "VERIFIED" | "REJECTED") => {
    const fullName = `${student.firstName} ${student.lastName}`.trim();
    try {
      await setStudentVerification(student.id, status);
      dispatch({ type: "SET_STUDENT_VERIFICATION", payload: { memberId: student.id, verified: status === "VERIFIED", verifiedBy: actor } });
      addAudit(dispatch, status === "VERIFIED" ? "Student verified" : "Student rejected", actor, `${fullName} · ${student.studentId}`);
      toast.success(`${status === "VERIFIED" ? "Document verified" : "Document rejected"} for ${fullName}`);
      await load();
    }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to update verification."); }
  };
  return <div className="space-y-4">
    <h3 className="font-bold text-lg flex items-center gap-2"><GraduationCap weight="fill" className="w-5 h-5 text-lime-400" /> Student document verification</h3>
    {loading && <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-400">Loading student records…</div>}
    {!!error && <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-5 text-red-200">{error} <button onClick={() => void load()} className="underline ml-2">Retry</button></div>}
    {!loading && !error && !students.length && <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-500">No students are awaiting document verification.</div>}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{students.map(student => <div key={student.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-3">
      <div className="flex items-start justify-between"><div><h4 className="font-bold">{student.firstName} {student.lastName}</h4><p className="text-xs text-zinc-500 font-mono">{student.customerCode} · {student.phone}</p></div><span className="text-xs px-2 py-1 rounded-full font-semibold bg-yellow-400/20 text-yellow-400">{student.verificationStatus}</span></div>
      <div className="text-sm text-zinc-400 space-y-1"><div><span className="text-zinc-500">Student ID:</span> {student.studentId}</div><div><span className="text-zinc-500">Institution:</span> {student.institution}</div></div>
      <div className="flex gap-2">{student.verificationStatus !== "VERIFIED" && <button disabled={!student.studentId.trim() || !student.institution.trim()} title={!student.studentId.trim() || !student.institution.trim() ? "Student ID and institution are required before approval" : undefined} onClick={() => void decide(student,"VERIFIED")} className="flex-1 bg-lime-400 text-zinc-950 font-bold text-sm py-2.5 rounded-xl disabled:opacity-40">Approve</button>}{student.verificationStatus !== "REJECTED" && <button onClick={() => void decide(student,"REJECTED")} className="flex-1 bg-zinc-800 text-zinc-200 font-semibold text-sm py-2.5 rounded-xl">Reject</button>}</div>
    </div>)}</div>
    <StudentPaymentQueue />
  </div>;
}

function StudentPaymentQueue() {
  const { state, dispatch } = useGym();
  const [requests, setRequests] = useState<Awaited<ReturnType<typeof fetchStudentPaymentReviewQueue>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRequests(await fetchStudentPaymentReviewQueue()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load student payment requests."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const review = async (paymentId: string, approve: boolean) => {
    setSavingId(paymentId);
    try {
      await reviewStudentMembershipPayment(paymentId, approve);
      addAudit(dispatch, approve ? "Student membership payment approved" : "Student membership payment rejected", state.currentUser?.name || "Staff", paymentId);
      toast.success(approve ? "Payment verified and membership activated." : "Payment proof rejected.");
      await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to review payment."); }
    finally { setSavingId(""); }
  };
  return <section className="space-y-4 pt-6 border-t border-zinc-800">
    <h3 className="font-bold text-lg">Student membership payments</h3>
    {loading && <p className="text-sm text-zinc-400">Loading payment requests…</p>}
    {!!error && <p className="text-sm text-red-300">{error} <button onClick={() => void load()} className="underline ml-2">Retry</button></p>}
    {!loading && !error && requests.length === 0 && <p className="text-sm text-zinc-500">No Student payment proofs are awaiting review.</p>}
    <div className="grid gap-3">{requests.map(request => <article key={request.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="font-semibold">{request.fullName} · {request.customerCode}</h4><p className="text-sm text-zinc-400">{request.planName} · {request.amount.toLocaleString()} {request.currency} · {request.paymentMethod}</p><p className="text-xs text-zinc-500">Submitted {new Date(request.createdAt).toLocaleString()}</p></div>
      <div className="flex gap-2">{request.proofUrl && <a href={request.proofUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-lime-300">Review proof</a>}
        <button disabled={savingId === request.id} onClick={() => void review(request.id, true)} className="rounded-lg bg-lime-400 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50">Approve</button>
        <button disabled={savingId === request.id} onClick={() => void review(request.id, false)} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50">Reject</button></div>
    </article>)}</div>
  </section>;
}
