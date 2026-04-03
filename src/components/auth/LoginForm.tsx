import type { FormEvent } from "react";
import { Mail } from "lucide-react";
import { AuthError } from "@/components/auth/AuthError";
import { PasswordField } from "@/components/auth/PasswordField";

type LoginFormProps = {
  email: string;
  password: string;
  error: string;
  isSubmitting: boolean;
  showPassword: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onForgotPassword: () => void;
  onOpenSignup: () => void;
};

export function LoginForm({
  email,
  password,
  error,
  isSubmitting,
  showPassword,
  onSubmit,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onForgotPassword,
  onOpenSignup,
}: LoginFormProps) {
  return (
    <form onSubmit={onSubmit} className="w-full space-y-4">
      <div className="space-y-1.5 focus-within:text-white text-white/70 transition-colors">
        <label className="block text-sm font-semibold ml-1 tracking-wide">Email</label>
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <Mail size={18} />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="Enter your email"
            className="w-full bg-black/20 border border-white/10 hover:border-white/20 focus:border-white/40 focus:bg-black/30 text-white placeholder:text-white/30 rounded-2xl py-3.5 pl-11 pr-4 focus:outline-none transition-all shadow-inner font-medium"
            required
          />
        </div>
      </div>

      <PasswordField
        label="Password"
        value={password}
        placeholder="Password"
        visible={showPassword}
        onChange={onPasswordChange}
        onToggleVisibility={onTogglePassword}
      />

      <AuthError error={error} />

      <div className="pt-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 rounded-2xl bg-[#ff3366] text-white font-bold text-lg hover:bg-[#ff4775] hover:shadow-[0_0_25px_rgba(255,51,102,0.4)] transition-all active:scale-95 duration-200 shadow-lg tracking-wide disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Logging In..." : "Log In"}
        </button>
      </div>

      <div className="flex flex-col gap-3 text-center pt-2">
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-white/50 text-sm font-medium hover:text-white transition-colors"
        >
          Lost your password?
        </button>
        <button
          type="button"
          onClick={onOpenSignup}
          className="text-[#ff3366] text-sm font-semibold hover:text-[#ff4775] transition-colors"
        >
          Don&apos;t have an account? Sign up
        </button>
      </div>
    </form>
  );
}
