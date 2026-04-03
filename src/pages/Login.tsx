import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Brain } from "lucide-react";
import { toast } from "sonner";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { LoginForm } from "@/components/auth/LoginForm";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { SignupForm } from "@/components/auth/SignupForm";
import { VerifyOtpForm } from "@/components/auth/VerifyOtpForm";
import {
  authenticateStoredUser,
  findStoredUser,
  getAuthenticatedSession,
  normalizeEmail,
  registerStoredUser,
  setAuthenticatedSession,
  updateStoredUserPassword,
} from "@/lib/auth";
import { getEmailJsConfigError, sendOtpEmail } from "@/lib/emailjs";
import {
  OTP_EXPIRY_MINUTES,
  OTP_LENGTH,
  OTP_RESEND_COOLDOWN_MS,
  clearPendingOtpChallenge,
  createOtpChallenge,
  formatCountdown,
  getPendingOtpChallenge,
  getRemainingSeconds,
  isOtpExpired,
  isValidOtpFormat,
  savePendingOtpChallenge,
} from "@/lib/otp";
import type { OtpChallenge, OtpPurpose } from "@/types/auth";

type ViewState = "login" | "forgot_password" | "verify_otp" | "reset_password" | "sign_up";

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
}

export default function Login() {
  const [challenge, setChallenge] = useState<OtpChallenge | null>(() => getPendingOtpChallenge());
  const [view, setView] = useState<ViewState>(() => (getPendingOtpChallenge() ? "verify_otp" : "login"));
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState(() => {
    const pending = getPendingOtpChallenge();
    return {
      email: pending?.purpose === "signup" ? pending.email : "",
      password: pending?.purpose === "signup" ? pending.pendingPassword ?? "" : "",
    };
  });
  const [forgotEmail, setForgotEmail] = useState(() => {
    const pending = getPendingOtpChallenge();
    return pending?.purpose === "forgot_password" ? pending.email : "";
  });
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [verifiedResetEmail, setVerifiedResetEmail] = useState<string | null>(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [now, setNow] = useState(Date.now());

  const navigate = useNavigate();
  const emailJsConfigError = getEmailJsConfigError();
  const otpExpired = challenge ? isOtpExpired(challenge, now) : false;
  const otpRemainingSeconds = challenge ? getRemainingSeconds(challenge.expiresAt, now) : 0;
  const resendRemainingSeconds = challenge ? getRemainingSeconds(challenge.requestedAt + OTP_RESEND_COOLDOWN_MS, now) : 0;

  const syncChallenge = (nextChallenge: OtpChallenge | null) => {
    setChallenge(nextChallenge);
    if (nextChallenge) savePendingOtpChallenge(nextChallenge);
    else clearPendingOtpChallenge();
  };

  const resetTransientState = () => {
    setOtp("");
    setNewPassword("");
    setVerifiedResetEmail(null);
    syncChallenge(null);
  };

  const requestOtp = async (purpose: OtpPurpose, email: string, pendingPassword?: string) => {
    const nextChallenge = createOtpChallenge({ purpose, email, pendingPassword });
    await sendOtpEmail({ toEmail: nextChallenge.email, otp: nextChallenge.otp, purpose });
    syncChallenge(nextChallenge);
    setOtp("");
    setError("");
    setView("verify_otp");
    toast.success(`OTP sent to ${nextChallenge.email}`, {
      description: `Enter the ${OTP_LENGTH}-digit code within ${OTP_EXPIRY_MINUTES} minutes.`,
      duration: 5000,
    });
  };

  useEffect(() => {
    if (getAuthenticatedSession()) navigate("/dashboard?tab=overview", { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!challenge) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [challenge]);

  const handleLoginSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      if (!loginForm.email || !loginForm.password) {
        setError("Please fill in all fields");
        return;
      }
      const result = authenticateStoredUser(normalizeEmail(loginForm.email), loginForm.password);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAuthenticatedSession(result.user.email);
      toast.success("Login successful!");
      navigate("/dashboard?tab=overview");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignupSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSendingOtp(true);
    try {
      const email = normalizeEmail(signupForm.email);
      if (!email || !signupForm.password) {
        setError("Please fill in all fields");
        return;
      }
      if (findStoredUser(email)) {
        setError("An account with this email already exists. Please log in.");
        return;
      }
      await requestOtp("signup", email, signupForm.password);
    } catch (error) {
      const message = getErrorMessage(error);
      setError(message);
      toast.error("Could not send signup OTP", { description: message });
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleForgotPasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSendingOtp(true);
    try {
      const email = normalizeEmail(forgotEmail);
      if (!email) {
        setError("Please enter your email");
        return;
      }
      if (!findStoredUser(email)) {
        setError("User not found");
        return;
      }
      await requestOtp("forgot_password", email);
    } catch (error) {
      const message = getErrorMessage(error);
      setError(message);
      toast.error("Could not send reset OTP", { description: message });
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsVerifyingOtp(true);
    try {
      if (!challenge) {
        setError("Please request a new OTP.");
        setView("login");
        return;
      }
      if (otpExpired) {
        setError("This OTP has expired. Please request a new one.");
        return;
      }
      if (!isValidOtpFormat(otp)) {
        setError("Please enter a valid 6-digit OTP.");
        return;
      }
      if (otp.trim() !== challenge.otp) {
        setError("Invalid OTP. Please try again.");
        return;
      }
      if (challenge.purpose === "signup") {
        if (!challenge.pendingPassword) {
          setError("Your sign up session expired. Please sign up again.");
          syncChallenge(null);
          setView("sign_up");
          return;
        }
        if (!registerStoredUser(challenge.email, challenge.pendingPassword)) {
          setError("An account with this email already exists. Please log in.");
          syncChallenge(null);
          setView("login");
          return;
        }
        setAuthenticatedSession(challenge.email);
        setSignupForm({ email: "", password: "" });
        syncChallenge(null);
        setOtp("");
        toast.success("Account verified successfully!");
        navigate("/dashboard?tab=overview");
        return;
      }
      if (!findStoredUser(challenge.email)) {
        setError("User not found");
        syncChallenge(null);
        setView("forgot_password");
        return;
      }
      setVerifiedResetEmail(challenge.email);
      syncChallenge(null);
      setOtp("");
      setView("reset_password");
      toast.success("OTP verified. You can set a new password now.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleResetPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsResettingPassword(true);
    try {
      if (!verifiedResetEmail) {
        setError("Verify OTP before resetting your password.");
        setView("forgot_password");
        return;
      }
      if (!newPassword) {
        setError("Please enter a new password");
        return;
      }
      if (!updateStoredUserPassword(verifiedResetEmail, newPassword)) {
        setError("User not found");
        setView("forgot_password");
        return;
      }
      setLoginForm({ email: verifiedResetEmail, password: "" });
      setForgotEmail("");
      setNewPassword("");
      setVerifiedResetEmail(null);
      toast.success("Password updated successfully. Please log in.");
      setView("login");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleResendOtp = async () => {
    if (!challenge || resendRemainingSeconds > 0) return;
    setError("");
    setIsSendingOtp(true);
    try {
      await requestOtp(challenge.purpose, challenge.email, challenge.pendingPassword);
    } catch (error) {
      const message = getErrorMessage(error);
      setError(message);
      toast.error("Could not resend OTP", { description: message });
    } finally {
      setIsSendingOtp(false);
    }
  };

  const goToLogin = () => {
    setError("");
    resetTransientState();
    setForgotEmail("");
    setView("login");
  };

  const handleBackFromVerify = () => {
    if (!challenge) return goToLogin();
    setError("");
    setOtp("");
    if (challenge.purpose === "signup") setSignupForm({ email: challenge.email, password: challenge.pendingPassword ?? signupForm.password });
    else setForgotEmail(challenge.email);
    syncChallenge(null);
    setView(challenge.purpose === "signup" ? "sign_up" : "forgot_password");
  };

  const otpHelperText = challenge
    ? otpExpired
      ? "This OTP has expired. Request a new one to continue."
      : `We've sent a 6-digit OTP to ${challenge.email}.`
    : "Request an OTP to continue.";

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-1000 transform scale-100" style={{ backgroundImage: "url('/login-bg.png')" }} />
      <div className="absolute inset-0 bg-[#0f0a1e]/60" />
      <motion.div initial={{ opacity: 0, scale: 0.98, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }} className="relative z-10 w-full max-w-[420px] px-5">
        <div className="backdrop-blur-lg bg-white/10 border border-white/30 rounded-3xl p-6 sm:p-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] flex flex-col items-center relative overflow-hidden group min-h-[540px]">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-70" />
          <div className="w-16 h-16 rounded-full border-[2.5px] border-white/90 flex items-center justify-center shadow-lg backdrop-blur-sm mb-6 bg-white/5 flex-shrink-0">
            <Brain className="h-8 w-8 text-white" strokeWidth={1.5} />
          </div>
          <div className="w-full flex-1 flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {view === "login" && <motion.div key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}><LoginForm email={loginForm.email} password={loginForm.password} error={error} isSubmitting={isSubmitting} showPassword={showLoginPassword} onSubmit={handleLoginSubmit} onEmailChange={(value) => setLoginForm((current) => ({ ...current, email: value }))} onPasswordChange={(value) => setLoginForm((current) => ({ ...current, password: value }))} onTogglePassword={() => setShowLoginPassword((current) => !current)} onForgotPassword={() => { setError(""); resetTransientState(); setView("forgot_password"); }} onOpenSignup={() => { setError(""); resetTransientState(); setView("sign_up"); }} /></motion.div>}
              {view === "sign_up" && <motion.div key="signup" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}><SignupForm email={signupForm.email} password={signupForm.password} error={error} configError={emailJsConfigError} isSendingOtp={isSendingOtp} showPassword={showSignupPassword} onSubmit={handleSignupSubmit} onEmailChange={(value) => setSignupForm((current) => ({ ...current, email: value }))} onPasswordChange={(value) => setSignupForm((current) => ({ ...current, password: value }))} onTogglePassword={() => setShowSignupPassword((current) => !current)} onBackToLogin={goToLogin} /></motion.div>}
              {view === "forgot_password" && <motion.div key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}><ForgotPasswordForm email={forgotEmail} error={error} configError={emailJsConfigError} isSendingOtp={isSendingOtp} onSubmit={handleForgotPasswordSubmit} onEmailChange={setForgotEmail} onBackToLogin={goToLogin} /></motion.div>}
              {view === "verify_otp" && <motion.div key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}><VerifyOtpForm otp={otp} helperText={otpHelperText} timerText={otpExpired ? "OTP expired" : `Expires in ${formatCountdown(otpRemainingSeconds)}`} resendText={resendRemainingSeconds > 0 ? `Resend in ${formatCountdown(resendRemainingSeconds)}` : "Resend OTP"} error={error} isSendingOtp={isSendingOtp} isVerifyingOtp={isVerifyingOtp} otpExpired={otpExpired} canResend={Boolean(challenge) && resendRemainingSeconds === 0} accountPendingNotice={challenge?.purpose === "signup"} onSubmit={handleVerifyOtp} onOtpChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, OTP_LENGTH))} onResend={handleResendOtp} onBack={handleBackFromVerify} /></motion.div>}
              {view === "reset_password" && <motion.div key="reset" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}><ResetPasswordForm email={verifiedResetEmail} password={newPassword} error={error} isResettingPassword={isResettingPassword} showPassword={showResetPassword} onSubmit={handleResetPassword} onPasswordChange={setNewPassword} onTogglePassword={() => setShowResetPassword((current) => !current)} /></motion.div>}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
