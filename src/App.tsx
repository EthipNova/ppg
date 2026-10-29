import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Barbell, User, Users, ShieldCheck, Envelope, SignOut, X, CheckCircle, Warning, Bell, ChalkboardTeacher } from "@phosphor-icons/react";
import { Toaster, toast } from "sonner";
import { GymProvider, useGym, useT, sendEmail, addAudit, generateId } from "./context/GymContext";
import type { AuthUser, Member, Role } from "./types";
import { LANGUAGES } from "./i18n/translations";
import PublicWebsite from "./components/PublicWebsite";
import LoginPage from "./components/LoginPage";
import AdminPortal from "./components/AdminPortal";
import StaffPortal from "./components/StaffPortal";
import MemberPortal from "./components/MemberPortal";
import TrainerPortal from "./components/TrainerPortal";
import { signOutUser } from "./services/auth";

const EMAIL_STATUS_LABELS: Record<string, string> = { queued: "Queued", sent: "Sent", delivered: "Delivered", opened: "Opened", failed: "Failed" };
const EMAIL_TYPE_LABELS: Record<string, string> = { welcome: "Welcome", receipt: "Receipt", reminder: "Reminder", expiry: "Expiry", marketing: "Announcement" };

export function getRoleDashboardPath(role: Role): string {
  switch (role) {
    case "owner":
      return "/admin";
    case "staff":
      return "/staff";
    case "trainer":
      return "/trainer";
    case "member":
      return "/member";
    default:
      return "/";
  }
}

interface ProtectedRouteProps {
  allowedRoles: Role[];
  children: React.ReactNode;
}

function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { state } = useGym();
  const location = useLocation();

  if (state.isAuthInitializing) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center text-white">
        <div className="w-16 h-16 rounded-2xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center mb-4">
          <Barbell weight="fill" className="w-8 h-8 text-lime-400 animate-pulse" />
        </div>
        <p className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Connecting to PowerPlus...</p>
      </div>
    );
  }

  if (!state.currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowedRoles.includes(state.currentUser.role)) {
    toast.error("Access Denied: You do not have permission to view that dashboard.");
    return <Navigate to={getRoleDashboardPath(state.currentUser.role)} replace />;
  }

  return <>{children}</>;
}

function AppShell() {
  const { state, dispatch } = useGym();
  const t = useT();
  const navigate = useNavigate();
  const [showEmailLog, setShowEmailLog] = useState(false);

  const handleLogout = async () => {
    try {
      await signOutUser();
    } catch (err) {
      console.error("Logout error:", err);
    }
    dispatch({ type: "SET_USER", payload: null });
    navigate("/login");
    toast(t("app.loggedOut"));
  };

  const handleJoin = (member: Member) => {
    dispatch({ type: "ADD_MEMBER", payload: member });
    dispatch({
      type: "SET_USER",
      payload: {
        id: member.id,
        name: member.name,
        role: "member",
        memberId: member.id,
        category: member.category,
      },
    });
    navigate("/member");
    toast.success(t("app.joined", { name: member.name }));
  };

  if (state.isAuthInitializing) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center text-white">
        <div className="w-16 h-16 rounded-2xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center mb-4">
          <Barbell weight="fill" className="w-8 h-8 text-lime-400 animate-pulse" />
        </div>
        <p className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Connecting to PowerPlus...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950 scroll-smooth">
      {/* Main navigation */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <Barbell weight="fill" className="w-7 h-7 text-lime-400" />
            <span className="font-black text-lg uppercase tracking-tight text-white hidden sm:block">{state.settings.gymName}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1" role="group" aria-label={t("app.language")}>
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => dispatch({ type: "SET_LANGUAGE", payload: lang.code })}
                  title={lang.label}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${state.language === lang.code ? "bg-lime-400 text-zinc-950" : "text-zinc-400 hover:text-white"}`}
                >
                  {lang.short}
                </button>
              ))}
            </div>
            {state.currentUser ? (
              <>
                <span
                  onClick={() => navigate(getRoleDashboardPath(state.currentUser!.role))}
                  className="text-sm text-zinc-400 hidden sm:flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
                >
                  {state.currentUser.role === "owner" && <ShieldCheck className="w-4 h-4 text-lime-400" />}
                  {state.currentUser.role === "staff" && <Users className="w-4 h-4 text-blue-400" />}
                  {state.currentUser.role === "member" && <User className="w-4 h-4 text-yellow-400" />}
                  {state.currentUser.role === "trainer" && <ChalkboardTeacher className="w-4 h-4 text-amber-400" />}
                  {state.currentUser.name}
                </span>
                <button onClick={() => setShowEmailLog(true)} className="relative p-2 text-zinc-400 hover:text-white transition-colors">
                  <Envelope className="w-5 h-5" />
                  {state.emailLogs.length > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-lime-400 text-zinc-950 text-[10px] font-bold rounded-full flex items-center justify-center">{state.emailLogs.length}</span>}
                </button>
                <button onClick={handleLogout} className="p-2 text-zinc-400 hover:text-red-400 transition-colors" title={t("app.logout")}><SignOut className="w-5 h-5" /></button>
              </>
            ) : (
              <>
                <button onClick={() => navigate("/login")} className="bg-lime-400 text-zinc-950 px-4 py-2 rounded-xl font-bold text-sm hover:bg-lime-300 transition-colors active:scale-[0.97]">
                  {t("app.portalAccess")}
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="relative pt-16 md:pt-[4.5rem]">
        <Routes>
          {/* Public Home */}
          <Route path="/" element={<PublicWebsite onJoin={handleJoin} />} />

          {/* Login Route: redirect to role dashboard if already authenticated */}
          <Route
            path="/login"
            element={
              state.currentUser ? (
                <Navigate to={getRoleDashboardPath(state.currentUser.role)} replace />
              ) : (
                <LoginPage
                  onBackToWebsite={() => navigate("/")}
                  onLoginSuccess={(role) => navigate(getRoleDashboardPath(role))}
                />
              )
            }
          />

          {/* Role Protected Dashboards */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={["owner"]}>
                <AdminPortal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute allowedRoles={["staff", "owner"]}>
                <StaffPortal />
              </ProtectedRoute>
            }
          />
          <Route path="/reception" element={<Navigate to="/staff" replace />} />
          <Route
            path="/trainer"
            element={
              <ProtectedRoute allowedRoles={["trainer"]}>
                <TrainerPortal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/member"
            element={
              <ProtectedRoute allowedRoles={["member", "owner"]}>
                <MemberPortal />
              </ProtectedRoute>
            }
          />

          {/* Catch-all */}
          <Route
            path="*"
            element={
              state.currentUser ? (
                <Navigate to={getRoleDashboardPath(state.currentUser.role)} replace />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
        </Routes>
      </main>

      {/* E-mail log */}
      <AnimatePresence>
        {showEmailLog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={() => setShowEmailLog(false)}>
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-zinc-900 border-l border-zinc-800 p-6 overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2"><Envelope className="w-5 h-5 text-lime-400" /> {t("app.emailLog")}</h3>
                <button onClick={() => setShowEmailLog(false)}><X className="w-5 h-5 text-zinc-400" /></button>
              </div>
              <div className="space-y-4">
                {state.emailLogs.slice().reverse().map(email => (
                  <div key={email.id} className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-semibold text-sm">{email.subject}</div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${email.status === "opened" ? "bg-lime-400/20 text-lime-400" : email.status === "delivered" ? "bg-blue-400/20 text-blue-400" : email.status === "failed" ? "bg-red-400/20 text-red-400" : "bg-zinc-600/20 text-zinc-400"}`}>{EMAIL_STATUS_LABELS[email.status] || email.status}</span>
                    </div>
                    <div className="text-xs text-zinc-500 mb-2">{t("app.recipient")}: {email.toName} &lt;{email.to}&gt;</div>
                    <div className="text-xs text-zinc-400 line-clamp-2">{email.body}</div>
                    <div className="flex justify-between items-center mt-3 text-xs text-zinc-600">
                      <span>{EMAIL_TYPE_LABELS[email.type] || email.type}</span>
                      <span>{new Date(email.sentAt).toLocaleString("en-US")}</span>
                    </div>
                  </div>
                ))}
                {state.emailLogs.length === 0 && <p className="text-zinc-500 text-center py-8">{t("app.noEmails")}</p>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toaster position="top-right" toastOptions={{ style: { background: "#18181b", border: "1px solid #27272a", color: "#fff" } }} />
    </div>
  );
}

export default function App() {
  return (
    <GymProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </GymProvider>
  );
}
