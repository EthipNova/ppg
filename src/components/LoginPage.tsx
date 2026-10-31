import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Barbell,
  Lock,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  ArrowLeft,
  CircleNotch,
  WarningCircle,
  X,
  ShieldCheck,
  Key,
  CheckCircle
} from "@phosphor-icons/react";
import { useGym } from "../context/GymContext";
import { signInWithEmail, resolveTrustedUserRole, signOutUser, requestPasswordRecovery, updateUserPassword, resolveLoginIdentifier } from "../services/auth";
import { supabase } from "../integrations/supabase/client";
import { supabaseConfig } from "../integrations/supabase/config";
import { getRoleDashboardPath } from "../App";
import { toast } from "sonner";
import type { Role } from "../types";

interface LoginPageProps {
  onBackToWebsite: () => void;
  onLoginSuccess?: (role: Role) => void;
}

export default function LoginPage({ onBackToWebsite, onLoginSuccess }: LoginPageProps) {
  const { state, dispatch } = useGym();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forgot Password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const [forgotStatus, setForgotStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Set New Password (Recovery) modal state
  const [showResetModal, setShowResetModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user landed from password recovery email (hash contains access_token / type=recovery)
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash && (hash.includes("type=recovery") || hash.includes("access_token"))) {
      console.log("[Auth-Diag] Detected password recovery token in URL hash");
      setShowResetModal(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        console.log("[Auth-Diag] Detected PASSWORD_RECOVERY auth event");
        setShowResetModal(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Form field errors
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});

  // Real authentication status/alert with diagnostic metadata
  const [authAlert, setAuthAlert] = useState<{
    type: "error" | "warning" | "info";
    title: string;
    message: string;
    stage?: string;
    code?: string;
    status?: number;
  } | null>(null);

  const validateForm = () => {
    const nextErrors: { identifier?: string; password?: string } = {};
    const trimmedId = identifier.trim();

    if (!trimmedId) {
      nextErrors.identifier = "Please enter your registered email address or Staff Login ID.";
    }

    if (!password) {
      nextErrors.password = "Please enter your password.";
    } else if (password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthAlert(null);

    if (isSubmitting) return; // Prevent duplicate submissions
    if (!validateForm()) return;

    const trimmedId = identifier.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedId);
    let authEmail = trimmedId.toLowerCase();

    setIsSubmitting(true);

    try {
      if (!isEmail) {
        // Resolve Staff Login ID (e.g. REC-101, TRN-101) to associated auth email
        const resolved = await resolveLoginIdentifier(trimmedId);
        if (!resolved?.email) {
          setErrors((prev) => ({
            ...prev,
            identifier: "No active account found for this Staff Login ID. Please verify your credentials.",
          }));
          setIsSubmitting(false);
          return;
        }
        authEmail = resolved.email.toLowerCase();
      }

      const sanitizedPassword = password.replace(/[\r\n]+$/, "");

      // Stage 1 Diagnostic Log: Login form submission
      console.log("[Auth-Diag] Stage 1: Login form submission", {
        identifier: trimmedId,
        authEmail,
        isEmail,
        passwordProvided: Boolean(sanitizedPassword),
        passwordLength: sanitizedPassword.length,
        passwordHasWhitespace: sanitizedPassword.trim() !== sanitizedPassword,
        supabaseUrl: supabaseConfig.url,
      });

      const { data, error } = await signInWithEmail(authEmail, sanitizedPassword);

      // Stage 2 Diagnostic Log: Supabase Auth sign-in response
      console.log("[Auth-Diag] Stage 2: Supabase Auth sign-in response", {
        hasUser: Boolean(data?.user),
        hasSession: Boolean(data?.session),
        error: error ? {
          message: error.message,
          status: error.status,
          code: (error as unknown as { code?: string }).code,
          name: error.name,
        } : null,
      });

      if (error) {
        const msg = error.message ? error.message.toLowerCase() : "";
        const errorCode = "code" in error && typeof (error as { code?: unknown }).code === "string"
          ? ((error as { code: string }).code).toLowerCase()
          : "";
        let alertTitle = "Authentication Failed";
        let userMessage = error.message || "Authentication failed. Please check your credentials.";

        if (error.status === 429 || msg.includes("rate limit") || msg.includes("too many requests")) {
          alertTitle = "Too Many Attempts";
          userMessage = "Too many failed attempts. Please wait a few moments before trying again.";
        } else if (msg.includes("email not confirmed") || errorCode === "email_not_confirmed") {
          alertTitle = "Email Not Confirmed";
          userMessage = "Your email address has not been confirmed yet. Please verify your email using the link sent to your inbox before signing in.";
        } else if (msg.includes("invalid login credentials") || errorCode === "invalid_credentials" || msg.includes("invalid email or password")) {
          alertTitle = "Authentication Failed";
          userMessage = "Invalid email or password. Please verify your credentials and try again.";
        } else if (msg.includes("user is disabled") || msg.includes("user disabled") || msg.includes("user blocked")) {
          alertTitle = "Account Disabled";
          userMessage = "Your account has been disabled. Please contact gym administration.";
        } else if (error.status && error.status >= 500) {
          alertTitle = "Service Unavailable";
          userMessage = "The sign-in service is temporarily unavailable. Please try again shortly.";
        }

        setAuthAlert({
          type: "error",
          title: alertTitle,
          message: userMessage,
          stage: "Stage 2: Supabase Auth (GoTrue)",
          code: errorCode || (error as unknown as { code?: string }).code || "invalid_credentials",
          status: error.status || 400,
        });
        return;
      }

      if (!data.user) {
        console.warn("[Auth-Diag] Stage 2 -> 3: No user object in sign-in response", data);
        setAuthAlert({
          type: "error",
          title: "Authentication Error",
          message: "No user account was returned by the authentication service.",
          stage: "Stage 3: Authenticated User ID",
        });
        return;
      }

      // Stage 3 Diagnostic Log: Authenticated user ID
      console.log("[Auth-Diag] Stage 3: Authenticated user ID", {
        userId: data.user.id,
        email: data.user.email,
        emailConfirmedAt: data.user.email_confirmed_at,
      });

      // Stage 4 & 5 Diagnostic Log: Trusted role & profile retrieval
      console.log("[Auth-Diag] Stage 4: Resolving trusted profile for user:", data.user.id);
      const trusted = await resolveTrustedUserRole(data.user.id);

      console.log("[Auth-Diag] Stage 5: Role resolution result", {
        userId: data.user.id,
        status: trusted?.status,
        role: trusted?.authUser?.role,
        source: trusted?.source,
        rejectReason: trusted?.rejectReason,
      });

      if (!trusted || trusted.status !== "active") {
        await signOutUser();

        let title = "Account Provisioning Required";
        let message = "Your account is authenticated, but no active gym profile or role has been linked yet. Portal access remains restricted until an administrator activates your role.";

        if (trusted?.rejectReason === "inactive") {
          title = "Account Inactive";
          message = "Your account has been deactivated or blocked. Please contact gym administration.";
        } else if (trusted?.rejectReason === "missing_profile") {
          title = "Profile Missing";
          message = "Your login account is not linked to any active staff, trainer, or member profile. Please contact reception.";
        } else if (trusted?.rejectReason === "unknown_role") {
          title = "Invalid Role";
          message = "Your account role could not be recognized. Access has been denied.";
        } else if (trusted?.rejectReason === "conflicting_role") {
          title = "Role Conflict";
          message = "Conflicting profile records were detected for your account. Access has been denied.";
        } else if (trusted?.rejectReason === "database_error") {
          title = "Profile Check Unavailable";
          message = "Your credentials were accepted, but the gym profile could not be checked because the database request failed. Please try again shortly.";
        }

        setAuthAlert({
          type: trusted?.rejectReason === "database_error" ? "error" : "warning",
          title,
          message,
          stage: "Stage 5: Role Resolution",
          code: trusted?.rejectReason || "not_active",
        });
        return;
      }

      // Stage 6 Diagnostic Log: Dashboard redirection
      const targetDashboardPath = getRoleDashboardPath(trusted.authUser.role);
      console.log("[Auth-Diag] Stage 6: Dashboard redirection", {
        userId: trusted.authUser.id,
        name: trusted.authUser.name,
        role: trusted.authUser.role,
        targetPath: targetDashboardPath,
      });

      // Successful authentication with trusted role
      dispatch({ type: "SET_USER", payload: trusted.authUser });
      toast.success(`Welcome back, ${trusted.authUser.name}!`);

      if (onLoginSuccess) {
        onLoginSuccess(trusted.authUser.role);
      }
    } catch (err) {
      console.error("[Auth-Diag] Unexpected exception during login flow:", err);
      const networkError = err instanceof TypeError;
      const errorMsg = err instanceof Error ? err.message : String(err);
      setAuthAlert({
        type: "error",
        title: networkError ? "Connection Error" : "Sign-In Unavailable",
        message: networkError
          ? "Unable to reach the sign-in service. Check your connection and try again."
          : errorMsg || "The sign-in service could not complete your request. Please try again shortly.",
        stage: "Stage 1: Form / Network",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = forgotEmail.trim();
    if (!trimmed) return;

    setIsForgotLoading(true);
    setForgotStatus(null);

    try {
      const { error } = await requestPasswordRecovery(trimmed);
      if (error) {
        let msg = "Unable to send password recovery instructions. Please try again later.";
        if (error.message.toLowerCase().includes("rate limit")) {
          msg = "Password recovery limit reached. Please wait a few minutes before requesting another email.";
        }
        setForgotStatus({
          type: "error",
          message: msg,
        });
      } else {
        setForgotStatus({
          type: "success",
          message: "If an account is associated with this email address, password recovery instructions have been sent. Please check your inbox and spam folder.",
        });
      }
    } catch {
      setForgotStatus({
        type: "error",
        message: "Network error occurred while requesting password recovery. Please try again.",
      });
    } finally {
      setIsForgotLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (!newPassword) {
      setResetError("Please enter a new password.");
      return;
    }
    if (newPassword.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match. Please verify.");
      return;
    }

    setIsResetSubmitting(true);
    try {
      console.log("[Auth-Diag] Updating user password through Supabase Auth...");
      const { error } = await updateUserPassword(newPassword);

      if (error) {
        console.error("[Auth-Diag] Password update error:", error);
        setResetError(error.message);
      } else {
        console.log("[Auth-Diag] Password successfully updated in Supabase Auth.");
        toast.success("Password reset successfully! Please sign in with your new password.");
        setShowResetModal(false);
        setNewPassword("");
        setConfirmPassword("");
        setPassword("");
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    } catch (err) {
      console.error("[Auth-Diag] Password update exception:", err);
      setResetError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setIsResetSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100dvh-4.5rem)] flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden bg-zinc-950 text-white">
      {/* Background ambient lighting effects */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(163,230,53,0.10),transparent_65%)] pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute top-1/4 -left-32 w-96 h-96 bg-lime-500/5 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-1/4 -right-32 w-96 h-96 bg-lime-500/5 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      <div className="w-full max-w-md mx-auto relative z-10">
        {/* Navigation back link */}
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToWebsite}
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-white transition-colors group focus:outline-none focus:ring-2 focus:ring-lime-400 rounded-lg px-2 py-1 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400 group-hover:text-lime-400 transition-colors" />
            <span>Back to Website</span>
          </button>

          <span className="text-xs uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
            Portal Access
          </span>
        </div>

        {/* Main Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/80"
        >
          {/* Brand Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-lime-400/10 border border-lime-400/25 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-lime-400/5">
              <Barbell weight="fill" className="w-9 h-9 text-lime-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              {state.settings.gymName || "PowerPlus Gym"}
            </h1>
            <p className="text-xs sm:text-sm font-bold uppercase tracking-widest text-lime-400 mt-1">
              Train Strong. Stay Strong.
            </p>
            <p className="text-xs text-zinc-400 mt-2">
              Sign in with your registered email and password.
            </p>
          </div>

          {/* Authentication Alert / Feedback */}
          <AnimatePresence>
            {authAlert && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={`mb-6 rounded-xl overflow-hidden border p-4 text-left ${
                  authAlert.type === "error"
                    ? "border-red-500/30 bg-red-500/10 text-red-300"
                    : authAlert.type === "warning"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                    : "border-lime-400/30 bg-lime-400/10 text-lime-300"
                }`}
              >
                <div className="flex items-start gap-3">
                  <WarningCircle weight="fill" className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1 w-full">
                    <div className="font-bold">{authAlert.title}</div>
                    <div className="text-zinc-300 leading-relaxed">{authAlert.message}</div>
                    {authAlert.stage && (
                      <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono opacity-80">
                        <span><strong>Stage:</strong> {authAlert.stage}</span>
                        {authAlert.code && <span><strong>Code:</strong> {authAlert.code}</span>}
                        {authAlert.status && <span><strong>Status:</strong> {authAlert.status}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Login Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Identifier Input */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-2"
              >
                Email Address or Staff Login ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <EnvelopeSimple className="w-5 h-5" />
                </div>
                <input
                  id="login-email"
                  name="email"
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={identifier}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (errors.identifier) setErrors((prev) => ({ ...prev, identifier: undefined }));
                    if (authAlert) setAuthAlert(null);
                  }}
                  placeholder="name@example.com or REC-101"
                  className={`w-full bg-zinc-950 border rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-500 transition-all focus:outline-none focus:ring-2 disabled:opacity-70 ${
                    errors.identifier
                      ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                      : "border-zinc-800 focus:border-lime-400 focus:ring-lime-400/20"
                  }`}
                  aria-invalid={Boolean(errors.identifier)}
                  aria-describedby={errors.identifier ? "identifier-error" : "identifier-hint"}
                />
              </div>
              {errors.identifier ? (
                <p id="identifier-error" className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                  <WarningCircle weight="fill" className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.identifier}</span>
                </p>
              ) : (
                <p id="identifier-hint" className="text-[11px] text-zinc-500 mt-1.5">
                  Sign in using your registered email address or assigned Staff Login ID.
                </p>
              )}
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-bold uppercase tracking-wider text-zinc-300"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotModal(true);
                    setForgotStatus(null);
                    setForgotEmail(identifier.includes("@") ? identifier : "");
                  }}
                  className="text-xs text-zinc-400 hover:text-lime-400 transition-colors font-medium focus:outline-none focus:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                    if (authAlert) setAuthAlert(null);
                  }}
                  placeholder="••••••••"
                  className={`w-full bg-zinc-950 border rounded-xl pl-11 pr-11 py-3 text-sm text-white placeholder-zinc-500 transition-all focus:outline-none focus:ring-2 disabled:opacity-70 ${
                    errors.password
                      ? "border-red-500/80 focus:border-red-500 focus:ring-red-500/20"
                      : "border-zinc-800 focus:border-lime-400 focus:ring-lime-400/20"
                  }`}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "password-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeSlash className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                  <WarningCircle weight="fill" className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.password}</span>
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-lime-400 text-zinc-950 font-black tracking-wide py-3.5 px-6 rounded-xl hover:bg-lime-300 transition-all text-sm uppercase flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-lime-400/10 disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-lime-400 focus:ring-offset-2 focus:ring-offset-zinc-900"
            >
              {isSubmitting ? (
                <>
                  <CircleNotch className="w-4 h-4 animate-spin text-zinc-950" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <ShieldCheck weight="bold" className="w-4 h-4" />
                  <span>Sign In to Portal</span>
                </>
              )}
            </button>
          </form>

          {/* Footer Assistance Note */}
          <div className="mt-8 pt-6 border-t border-zinc-800/80 text-center">
            <p className="text-xs text-zinc-500">
              Need access or have questions? Contact the gym reception desk or speak with management.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Forgot Password Modal */}
      <AnimatePresence>
        {showForgotModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setShowForgotModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 w-full max-w-md shadow-2xl relative text-left"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center">
                    <Key weight="fill" className="w-5 h-5 text-lime-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Password Recovery</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white transition-colors"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!forgotStatus || forgotStatus.type === "error" ? (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Enter the email address registered with your PowerPlus account. We will send a secure link to reset your password.
                  </p>

                  {forgotStatus && forgotStatus.type === "error" && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-start gap-2">
                      <WarningCircle weight="fill" className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{forgotStatus.message}</span>
                    </div>
                  )}

                  <div>
                    <label htmlFor="forgot-email" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Registered Email Address
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      required
                      value={forgotEmail}
                      disabled={isForgotLoading}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-lime-400 focus:ring-1 focus:ring-lime-400 disabled:opacity-70"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      disabled={isForgotLoading}
                      onClick={() => setShowForgotModal(false)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors text-xs font-semibold disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isForgotLoading}
                      className="flex-1 bg-lime-400 text-zinc-950 px-4 py-2.5 rounded-xl font-bold hover:bg-lime-300 transition-colors text-xs uppercase flex items-center justify-center gap-1.5 disabled:opacity-70"
                    >
                      {isForgotLoading ? (
                        <>
                          <CircleNotch className="w-3.5 h-3.5 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <span>Send Instructions</span>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-lime-400/10 border border-lime-400/20 text-xs text-zinc-300">
                    <div className="font-bold text-lime-400 mb-1 flex items-center gap-1.5">
                      <CheckCircle weight="fill" className="w-4 h-4" />
                      Recovery Request Sent
                    </div>
                    <p className="leading-relaxed">
                      {forgotStatus.message}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-white py-2.5 rounded-xl text-xs font-bold transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Set New Password Modal (Password Recovery Flow) */}
      <AnimatePresence>
        {showResetModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 w-full max-w-md shadow-2xl relative text-left"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center">
                    <Key weight="fill" className="w-5 h-5 text-lime-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Set New Password</h3>
                    <p className="text-xs text-zinc-400">Enter your new secure password</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white transition-colors"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Your recovery link was verified. Set a new password for your account below.
                </p>

                {resetError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-start gap-2">
                    <WarningCircle weight="fill" className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{resetError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      disabled={isResetSubmitting}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-lime-400 focus:ring-1 focus:ring-lime-400 disabled:opacity-70 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300"
                    >
                      {showNewPassword ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    disabled={isResetSubmitting}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-lime-400 focus:ring-1 focus:ring-lime-400 disabled:opacity-70"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isResetSubmitting}
                    onClick={() => setShowResetModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors text-xs font-semibold disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isResetSubmitting}
                    className="flex-1 bg-lime-400 text-zinc-950 px-4 py-2.5 rounded-xl font-bold hover:bg-lime-300 transition-colors text-xs uppercase flex items-center justify-center gap-1.5 disabled:opacity-70"
                  >
                    {isResetSubmitting ? (
                      <>
                        <CircleNotch className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Password</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
