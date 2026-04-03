export type StoredUser = {
  email: string;
  password: string;
};

export type AuthSession = {
  email: string;
  name: string;
};

export type OtpPurpose = "signup" | "forgot_password";

export type OtpChallenge = {
  purpose: OtpPurpose;
  email: string;
  otp: string;
  expiresAt: number;
  requestedAt: number;
  pendingPassword?: string;
};
