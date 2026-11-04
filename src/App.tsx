import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import { Barbell, User, Users, ShieldCheck, SignOut, ChalkboardTeacher } from "@phosphor-icons/react";
import { Toaster, toast } from "sonner";
import { GymProvider, useGym, useT } from "./context/GymContext";
import type { Member, Role } from "./types";
import { LANGUAGES } from "./i18n/translations";
import PublicWebsite from "./components/PublicWebsite";
import LoginPage from "./components/LoginPage";
import ResetPasswordPage from "./components/ResetPasswordPage";
import AdminPortal from "./components/AdminPortal";
import StaffPortal from "./components/StaffPortal";
import MemberPortal from "./components/MemberPortal";
import TrainerPortal from "./components/TrainerPortal";
import { signOutUser } from "./services/auth";

export function getRoleDashboardPath(role: Role): string {
  switch (role) {
    case "owner":
      return "/admin/dashboard";
    case "staff":
      return "/reception/dashboard";
    case "trainer":
      return "/trainer/dashboard";
    case "member":
      return "/customer/dashboard";
    default:
      return "/";
  }
}

function StaffPortalRouteRedirect() {
  const { section } = useParams();
  return <Navigate to={`/reception/${section || "dashboard"}`} replace />;
}

function MemberPortalRouteRedirect() {
  const { section } = useParams();
  return <Navigate to={`/customer/${section || "dashboard"}`} replace />;
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

          {/* Public Quick Links */}
          <div className="hidden lg:flex items-center gap-6 text-sm font-semibold text-zinc-300">
            <button onClick={() => navigate("/memberships")} className="hover:text-lime-400 transition-colors cursor-pointer">Memberships</button>
            <button onClick={() => navigate("/facilities")} className="hover:text-lime-400 transition-colors cursor-pointer">Facilities</button>
            <button onClick={() => navigate("/about")} className="hover:text-lime-400 transition-colors cursor-pointer">About</button>
            <button onClick={() => navigate("/contact")} className="hover:text-lime-400 transition-colors cursor-pointer">Contact</button>
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
          {/* Public Website Routes */}
          <Route path="/" element={<PublicWebsite onJoin={handleJoin} />} />
          <Route path="/about" element={<PublicWebsite onJoin={handleJoin} initialSection="about" />} />
          <Route path="/memberships" element={<PublicWebsite onJoin={handleJoin} initialSection="plans" />} />
          <Route path="/facilities" element={<PublicWebsite onJoin={handleJoin} initialSection="facilities" />} />
          <Route path="/trainers" element={<PublicWebsite onJoin={handleJoin} initialSection="about" />} />
          <Route path="/contact" element={<PublicWebsite onJoin={handleJoin} initialSection="contact" />} />

          {/* Authentication Routes */}
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
          <Route path="/forgot-password" element={<Navigate to="/login?forgot=true" replace />} />
          <Route
            path="/reset-password"
            element={<ResetPasswordPage onBackToLogin={() => navigate("/login")} />}
          />

          {/* Admin Portal Routes */}
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route
            path="/admin/:section"
            element={
              <ProtectedRoute allowedRoles={["owner"]}>
                <AdminPortal />
              </ProtectedRoute>
            }
          />

          {/* Reception & Staff Portal Routes */}
          <Route path="/reception" element={<Navigate to="/reception/dashboard" replace />} />
          <Route
            path="/reception/:section"
            element={
              <ProtectedRoute allowedRoles={["staff", "owner"]}>
                <StaffPortal />
              </ProtectedRoute>
            }
          />
          <Route path="/staff" element={<Navigate to="/reception/dashboard" replace />} />
          <Route path="/staff/:section" element={<StaffPortalRouteRedirect />} />

          {/* Trainer Portal Routes */}
          <Route path="/trainer" element={<Navigate to="/trainer/dashboard" replace />} />
          <Route
            path="/trainer/:section"
            element={
              <ProtectedRoute allowedRoles={["trainer"]}>
                <TrainerPortal />
              </ProtectedRoute>
            }
          />

          {/* Customer & Member Portal Routes */}
          <Route path="/customer" element={<Navigate to="/customer/dashboard" replace />} />
          <Route
            path="/customer/:section"
            element={
              <ProtectedRoute allowedRoles={["member", "owner"]}>
                <MemberPortal />
              </ProtectedRoute>
            }
          />
          <Route path="/member" element={<Navigate to="/customer/dashboard" replace />} />
          <Route path="/member/:section" element={<MemberPortalRouteRedirect />} />

          {/* Fallback Catch-all Route */}
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
