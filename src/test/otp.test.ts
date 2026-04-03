import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingOtpChallenge,
  createOtpChallenge,
  formatCountdown,
  getPendingOtpChallenge,
  isOtpExpired,
  isValidOtpFormat,
  savePendingOtpChallenge,
} from "@/lib/otp";

describe("otp helpers", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("creates a six-digit numeric OTP and stores it temporarily", () => {
    const challenge = createOtpChallenge({
      purpose: "signup",
      email: "User@Example.com",
      pendingPassword: "secret123",
    });

    expect(challenge.email).toBe("user@example.com");
    expect(isValidOtpFormat(challenge.otp)).toBe(true);

    savePendingOtpChallenge(challenge);
    expect(getPendingOtpChallenge()).toEqual(challenge);

    clearPendingOtpChallenge();
    expect(getPendingOtpChallenge()).toBeNull();
  });

  it("tracks expiry and countdown formatting", () => {
    const challenge = createOtpChallenge({
      purpose: "forgot_password",
      email: "user@example.com",
    });

    expect(isOtpExpired({ ...challenge, expiresAt: Date.now() - 1 })).toBe(true);
    expect(formatCountdown(61)).toBe("1:01");
  });
});
