import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Barbell,
  Lock,
  Eye,
  EyeSlash,
  ArrowLeft,
  CircleNotch,
  WarningCircle,
  CheckCircle,
  Key,
  ShieldCheck,
} from "@phosphor-icons/react";
import { supabase } from "../integrations/supabase/client";
import { updateUserPassword, signOutUser, requestPasswordRecovery } from "../services/auth";
import { useGym } from "../context/GymContext";

interface ResetPasswordPageProps {
  onBackToLogin: () => void;
}

export default function ResetPasswordPage({ onBackToLogin }: ResetPasswordPageProps) {
  const { state } = useGym();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSessionValid, setIsSessionValid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Fallback requesting another link state
  const [showRequestNew, setShowRequestNew] = useState(false);
  const [requestEmail, setRequestEmail] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function evaluateRecoverySession() {
      try {
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const search = typeof window !== "undefined" ? window.location.search : "";
        const hasRecoveryMarker =
          hash.includes("type=recovery") ||
          hash.includes("access_token") ||
          search.includes("type=recovery") ||
          search.includes("code=");

        // Check current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (session || hasRecoveryMarker) {
          if (mounted) {
            setIsSessionValid(true);
            setIsCheckingSession(false);
          }
          return;
        }

        if (sessionError) {
          console.warn("[ResetPassword] Session query note:", sessionError.message);
        }

        // Wait a short moment in case GoTrue is asynchronously exchanging the token
        setTimeout(async () => {
          if (!mounted) return;
          const { data: { session: delayedSession } } = await supabase.auth.getSession();
          if (mounted) {
            setIsSessionValid(Boolean(delayedSession));
            setIsCheckingSession(false);
          }
        }, 1200);
      } catch (err) {
        console.error("[ResetPassword] Session evaluation exception:", err);
        if (mounted) {
          setIsSessionValid(false);
          setIsCheckingSession(false);
        }
      }
    }

    void evaluateRecoverySession();

    // Listen for PASSWORD_RECOVERY auth event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        if (mounted) {
          setIsSessionValid(true);
          setIsCheckingSession(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedPassword = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedPassword) {
      setErrorMessage("Please enter a new password.");
      return;
    }
    if (trimmedPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }
    if (trimmedPassword !== trimmedConfirm) {
      setErrorMessage("Passwords do not match. Please verify.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await updateUserPassword(trimmedPassword);

      if (error) {
        let msg = error.message;
        if (error.message.toLowerCase().includes("session") || error.message.toLowerCase().includes("token")) {
          msg = "Your recovery session has expired. Please request a new reset link.";
        }
        setErrorMessage(msg);
      } else {
        setIsSuccess(true);
        // Clear clean url and sign out temporary recovery session
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", window.location.pathname);
        }
        await signOutUser().catch(() => null);
      }
    } catch (err: unknown) {
      console.error("[ResetPassword] Update password exception:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to update password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError(null);
    const trimmed = requestEmail.trim().toLowerCase();

    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setRequestError("Please enter a valid email address.");
      return;
    }

    setIsRequesting(true);
    try {
      await requestPasswordRecovery(trimmed);
      setRequestSent(true);
    } catch (err: unknown) {
      console.error("[ResetPassword] Request new link exception:", err);
      setRequestError("Unable to send reset instructions. Please try again later.");
    } finally {
      setIsRequesting(false);
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

      <div className="w-full max-w-md mx-auto relative z-10">
        {/* Navigation back link */}
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToLogin}
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-white transition-colors group focus:outline-none focus:ring-2 focus:ring-lime-400 rounded-lg px-2 py-1 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400 group-hover:text-lime-400 transition-colors" />
            <span>Back to Sign In</span>
          </button>

          <span className="text-xs uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
            Security
          </span>
        </div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/80"
        >
          {/* Brand Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-lime-400/10 border border-lime-400/25 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-lime-400/5">
              <Key weight="fill" className="w-9 h-9 text-lime-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              Reset Password
            </h1>
            <p className="text-xs sm:text-sm font-bold uppercase tracking-widest text-lime-400 mt-1">
              {state.settings.gymName || "PowerPlus Gym"}
            </p>
          </div>

          {/* Loading verification state */}
          {isCheckingSession && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <CircleNotch className="w-8 h-8 text-lime-400 animate-spin mb-3" />
              <p className="text-sm font-semibold text-zinc-300">Verifying reset link...</p>
              <p className="text-xs text-zinc-500 mt-1">Checking your secure recovery credentials.</p>
            </div>
          )}

          {/* Success state */}
          {!isCheckingSession && isSuccess && (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-lime-400/10 border border-lime-400/30 flex items-center justify-center mx-auto text-lime-400">
                <CheckCircle weight="fill" className="w-9 h-9" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-white mb-2">Password Updated!</h2>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  Your password has been successfully updated. You can now use your new credentials to sign in to your PowerPlus Gym portal.
                </p>
              </div>

              <button
                type="button"
                onClick={onBackToLogin}
                className="w-full bg-lime-400 text-zinc-950 font-black tracking-wide py-3 px-6 rounded-xl hover:bg-lime-300 transition-all text-sm uppercase flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-lime-400/10"
              >
                <ShieldCheck weight="bold" className="w-4 h-4" />
                <span>Sign In with New Password</span>
              </button>
            </div>
          )}

          {/* Invalid or Expired Session state */}
          {!isCheckingSession && !isSuccess && !isSessionValid && (
            <div className="space-y-6 text-center py-2">
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center mx-auto text-red-400">
                <WarningCircle weight="fill" className="w-8 h-8" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-white mb-1.5">Reset Link Expired or Invalid</h2>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  This password reset link is invalid, has expired, or has already been used. Please request a fresh reset link below.
                </p>
              </div>

              {!showRequestNew ? (
                <div className="space-y-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRequestNew(true)}
                    className="w-full bg-lime-400 text-zinc-950 font-bold py-3 px-4 rounded-xl hover:bg-lime-300 transition-colors text-xs uppercase"
                  >
                    Request a New Reset Link
                  </button>
                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="w-full bg-zinc-800 text-zinc-300 hover:text-white py-2.5 px-4 rounded-xl transition-colors text-xs font-semibold"
                  >
                    Return to Sign In
                  </button>
                </div>
              ) : requestSent ? (
                <div className="p-4 rounded-xl bg-lime-400/10 border border-lime-400/20 text-left">
                  <div className="font-bold text-lime-400 text-xs mb-1 flex items-center gap-1.5">
                    <CheckCircle weight="fill" className="w-4 h-4" />
                    Reset Link Requested
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    If an account exists with that email address, a new password reset link will be sent.
                  </p>
                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="mt-4 w-full bg-zinc-800 hover:bg-zinc-700 text-white py-2 rounded-xl text-xs font-bold transition-colors"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRequestNewLink} className="space-y-3 text-left pt-2">
                  {requestError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-start gap-2">
                      <WarningCircle weight="fill" className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{requestError}</span>
                    </div>
                  )}
                  <div>
                    <label htmlFor="recovery-email" className="block text-xs font-bold uppercase text-zinc-300 mb-1">
                      Email Address
                    </label>
                    <input
                      id="recovery-email"
                      type="email"
                      required
                      value={requestEmail}
                      onChange={(e) => setRequestEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-lime-400 focus:ring-1 focus:ring-lime-400"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isRequesting}
                    className="w-full bg-lime-400 text-zinc-950 font-bold py-2.5 rounded-xl hover:bg-lime-300 transition-colors text-xs uppercase flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isRequesting ? (
                      <>
                        <CircleNotch className="w-4 h-4 animate-spin" />
                        <span>Sending Link...</span>
                      </>
                    ) : (
                      <span>Send New Link</span>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Valid Session: Password Input Form */}
          {!isCheckingSession && !isSuccess && isSessionValid && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <p className="text-xs text-zinc-400 mb-2 leading-relaxed">
                Your reset request has been verified. Enter a new, secure password for your account.
              </p>

              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300 flex items-start gap-2.5"
                >
                  <WarningCircle weight="fill" className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </motion.div>
              )}

              {/* New Password */}
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-1.5"
                >
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Minimum 8 characters"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-11 pr-11 py-3 text-sm text-white placeholder-zinc-500 transition-all focus:outline-none focus:border-lime-400 focus:ring-1 focus:ring-lime-400 disabled:opacity-70"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeSlash className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Must be at least 8 characters long.</p>
              </div>

              {/* Confirm New Password */}
              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-1.5"
                >
                  Confirm New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Repeat new password"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-11 pr-11 py-3 text-sm text-white placeholder-zinc-500 transition-all focus:outline-none focus:border-lime-400 focus:ring-1 focus:ring-lime-400 disabled:opacity-70"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeSlash className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-lime-400 text-zinc-950 font-black tracking-wide py-3.5 px-6 rounded-xl hover:bg-lime-300 transition-all text-sm uppercase flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-lime-400/10 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              >
                {isSubmitting ? (
                  <>
                    <CircleNotch className="w-4 h-4 animate-spin text-zinc-950" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <>
                    <Key weight="bold" className="w-4 h-4" />
                    <span>Update Password</span>
                  </>
                )}
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </div>
  );
}

