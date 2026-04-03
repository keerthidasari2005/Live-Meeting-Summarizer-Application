import { beforeEach, describe, expect, it } from "vitest";
import {
  authenticateStoredUser,
  getAuthenticatedSession,
  registerStoredUser,
  setAuthenticatedSession,
  updateStoredUserPassword,
} from "@/lib/auth";

describe("auth storage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("blocks unknown users from logging in", () => {
    const result = authenticateStoredUser("unknown@example.com", "secret");

    expect(result.ok).toBe(false);
    expect(result.message).toBe("User does not exist. Please sign up.");
  });

  it("prevents duplicate signups", () => {
    expect(registerStoredUser("user@example.com", "secret123")).toBe(true);
    expect(registerStoredUser("USER@example.com", "another-password")).toBe(false);
  });

  it("updates stored passwords and keeps the session valid only for real users", () => {
    registerStoredUser("user@example.com", "secret123");
    expect(updateStoredUserPassword("user@example.com", "new-secret")).toBe(true);
    expect(authenticateStoredUser("user@example.com", "new-secret").ok).toBe(true);

    setAuthenticatedSession("user@example.com");
    expect(getAuthenticatedSession()?.email).toBe("user@example.com");

    localStorage.removeItem("meetingmind_users");
    expect(getAuthenticatedSession()).toBeNull();
  });
});
