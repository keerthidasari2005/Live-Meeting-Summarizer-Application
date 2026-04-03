import type { FormEvent } from "react";
import { AuthError } from "@/components/auth/AuthError";
import { PasswordField } from "@/components/auth/PasswordField";

type ResetPasswordFormProps = {
  email: string | null;
  password: string;
  error: string;
  isResettingPassword: boolean;
  showPassword: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
};

export function ResetPasswordForm({
  email,
  password,
  error,
  isResettingPassword,
  showPassword,
  onSubmit,
  onPasswordChange,
  onTogglePassword,
}: ResetPasswordFormProps) {
  return (
    <form onSubmit={onSubmit} className="w-full space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-white text-xl font-bold mb-2">New Password</h3>
        <p className="text-white/60 text-sm">Set a new password for {email || "your account"}.</p>
      </div>

      <PasswordField
        label="New Password"
        value={password}
        placeholder="New Password"
        visible={showPassword}
        onChange={onPasswordChange}
        onToggleVisibility={onTogglePassword}
      />

      <AuthError error={error} />

      <div className="pt-5 flex flex-col gap-3">
        <button
          type="submit"
          disabled={!email || isResettingPassword}
          className="w-full py-4 rounded-2xl bg-[#ff3366] text-white font-bold text-lg hover:bg-[#ff4775] hover:shadow-[0_0_25px_rgba(255,51,102,0.4)] transition-all active:scale-95 duration-200 shadow-lg tracking-wide disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isResettingPassword ? "Updating..." : "Update Password"}
        </button>
      </div>
    </form>
  );
}
