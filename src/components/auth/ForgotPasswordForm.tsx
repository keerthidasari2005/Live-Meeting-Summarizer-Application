import type { FormEvent } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { AuthError } from "@/components/auth/AuthError";
import { ConfigNotice } from "@/components/auth/ConfigNotice";

type ForgotPasswordFormProps = {
  email: string;
  error: string;
  configError: string | null;
  isSendingOtp: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEmailChange: (value: string) => void;
  onBackToLogin: () => void;
};

export function ForgotPasswordForm({
  email,
  error,
  configError,
  isSendingOtp,
  onSubmit,
  onEmailChange,
  onBackToLogin,
}: ForgotPasswordFormProps) {
  return (
    <form onSubmit={onSubmit} className="w-full space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-white text-xl font-bold mb-2">Forgot Password</h3>
        <p className="text-white/60 text-sm">We&apos;ll send an OTP to your registered email.</p>
      </div>

      <ConfigNotice message={configError} />

      <div className="space-y-1.5 focus-within:text-white text-white/70 transition-colors">
        <label className="block text-sm font-semibold ml-1 tracking-wide">Email Address</label>
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <Mail size={18} />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="your@email.com"
            className="w-full bg-black/20 border border-white/10 hover:border-white/20 focus:border-white/40 focus:bg-black/30 text-white placeholder:text-white/30 rounded-2xl py-3.5 pl-11 pr-4 focus:outline-none transition-all shadow-inner font-medium"
            required
          />
        </div>
      </div>

      <AuthError error={error} />

      <div className="pt-5 space-y-3">
        <button
          type="submit"
          disabled={isSendingOtp || Boolean(configError)}
          className="w-full py-4 rounded-2xl bg-[#ff3366] text-white font-bold text-lg hover:bg-[#ff4775] hover:shadow-[0_0_25px_rgba(255,51,102,0.4)] transition-all active:scale-95 duration-200 shadow-lg tracking-wide disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSendingOtp ? "Sending OTP..." : "Send OTP"}
        </button>
        <button
          type="button"
          onClick={onBackToLogin}
          className="w-full py-3.5 rounded-2xl bg-white/5 text-white/80 font-medium hover:bg-white/10 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <ArrowLeft size={16} /> Back to Login
        </button>
      </div>
    </form>
  );
}
