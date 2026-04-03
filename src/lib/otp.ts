import { normalizeEmail } from "@/lib/auth";
import type { OtpChallenge, OtpPurpose } from "@/types/auth";

const OTP_STORAGE_KEY = "meetingmind_pending_otp";

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MS = 5 * 60 * 1000;
export const OTP_EXPIRY_MINUTES = 5;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;

function isOtpChallenge(value: unknown): value is OtpChallenge {
  return Boolean(
    value &&
      typeof value === "object" &&
      "purpose" in value &&
      "email" in value &&
      "otp" in value &&
      "expiresAt" in value &&
      "requestedAt" in value &&
      (value.purpose === "signup" || value.purpose === "forgot_password") &&
      typeof value.email === "string" &&
      typeof value.otp === "string" &&
      typeof value.expiresAt === "number" &&
      typeof value.requestedAt === "number" &&
      (!("pendingPassword" in value) || value.pendingPassword === undefined || typeof value.pendingPassword === "string"),
  );
}

function safeParseChallenge(value: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return isOtpChallenge(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function generateOtp() {
  return Array.from({ length: OTP_LENGTH }, () => Math.floor(Math.random() * 10)).join("");
}

export function isValidOtpFormat(value: string) {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(value.trim());
}

export function createOtpChallenge(input: {
  purpose: OtpPurpose;
  email: string;
  pendingPassword?: string;
}): OtpChallenge {
  const now = Date.now();

  return {
    purpose: input.purpose,
    email: normalizeEmail(input.email),
    otp: generateOtp(),
    expiresAt: now + OTP_EXPIRY_MS,
    requestedAt: now,
    pendingPassword: input.pendingPassword,
  };
}

export function getPendingOtpChallenge() {
  return safeParseChallenge(sessionStorage.getItem(OTP_STORAGE_KEY));
}

export function savePendingOtpChallenge(challenge: OtpChallenge) {
  sessionStorage.setItem(OTP_STORAGE_KEY, JSON.stringify(challenge));
}

export function clearPendingOtpChallenge() {
  sessionStorage.removeItem(OTP_STORAGE_KEY);
}

export function isOtpExpired(challenge: OtpChallenge, now = Date.now()) {
  return now >= challenge.expiresAt;
}

export function getRemainingSeconds(targetTimestamp: number, now = Date.now()) {
  return Math.max(0, Math.ceil((targetTimestamp - now) / 1000));
}

export function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
