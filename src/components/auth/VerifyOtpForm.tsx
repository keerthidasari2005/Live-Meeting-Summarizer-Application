import type { FormEvent } from "react";
import { ArrowLeft, KeyRound, RefreshCcw, Timer } from "lucide-react";
import { AuthError } from "@/components/auth/AuthError";

type VerifyOtpFormProps = {
  otp: string;
  helperText: string;
  timerText: string;
  resendText: string;
  error: string;
  isSendingOtp: boolean;
  isVerifyingOtp: boolean;
  otpExpired: boolean;
  canResend: boolean;
  accountPendingNotice: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOtpChange: (value: string) => void;
  onResend: () => void;
  onBack: () => void;
};

export function VerifyOtpForm({
  otp,
  helperText,
  timerText,
  resendText,
  error,
  isSendingOtp,
  isVerifyingOtp,
  otpExpired,
  canResend,
  accountPendingNotice,
  onSubmit,
  onOtpChange,
  onResend,
  onBack,
}: VerifyOtpFormProps) {
  return (
    <form onSubmit={onSubmit} className="w-full space-y-4">
      <div className="text-center mb-5">
        <h3 className="text-white text-xl font-bold mb-2">Verify OTP</h3>
        <p className="text-white/60 text-sm">{helperText}</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-white/80 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-white/75">
            <Timer size={16} />
            <span>{timerText}</span>
          </div>
          <button
            type="button"
            onClick={onResend}
            disabled={!canResend || isSendingOtp}
            className="text-[#ff8fab] hover:text-white transition-colors disabled:text-white/30 disabled:cursor-not-allowed inline-flex items-center gap-1"
          >
            <RefreshCcw size={14} />
            {resendText}
          </button>
        </div>
        {accountPendingNotice && (
          <p className="text-xs text-white/55">Your account will be created only after the OTP is verified.</p>
        )}
      </div>

      <div className="space-y-1.5 focus-within:text-white text-white/70 transition-colors">
        <label className="block text-sm font-semibold ml-1 tracking-wide">Enter OTP</label>
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <KeyRound size={18} />
          </div>
          <input
            type="text"
            inputMode="numeric"
            value={otp}
            onChange={(e) => onOtpChange(e.target.value)}
            placeholder="123456"
            className="w-full bg-black/20 border border-white/10 hover:border-white/20 focus:border-white/40 focus:bg-black/30 text-white placeholder:text-white/30 rounded-2xl py-3.5 pl-11 pr-4 focus:outline-none transition-all shadow-inner font-medium tracking-[0.45em] text-center"
            maxLength={6}
            required
          />
        </div>
      </div>

      <AuthError error={error} />

      <div className="pt-5 space-y-3">
        <button
          type="submit"
          disabled={otpExpired || otp.length !== 6 || isVerifyingOtp}
          className="w-full py-4 rounded-2xl bg-[#ff3366] text-white font-bold text-lg hover:bg-[#ff4775] hover:shadow-[0_0_25px_rgba(255,51,102,0.4)] transition-all active:scale-95 duration-200 shadow-lg tracking-wide disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isVerifyingOtp ? "Verifying..." : "Verify OTP"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="w-full py-3.5 rounded-2xl bg-white/5 text-white/80 font-medium hover:bg-white/10 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>
    </form>
  );
}
