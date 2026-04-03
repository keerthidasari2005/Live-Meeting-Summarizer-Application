import type { AuthSession, StoredUser } from "@/types/auth";

const USERS_STORAGE_KEY = "meetingmind_users";
const SESSION_STORAGE_KEY = "meetingmind_user";

function safeParse(value: string | null): unknown {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isStoredUser(value: unknown): value is StoredUser {
  return Boolean(
    value &&
      typeof value === "object" &&
      "email" in value &&
      "password" in value &&
      typeof value.email === "string" &&
      typeof value.password === "string",
  );
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function buildSession(email: string): AuthSession {
  const normalizedEmail = normalizeEmail(email);
  const name = normalizedEmail.split("@")[0] || "User";

  return { email: normalizedEmail, name };
}

export function loadStoredUsers(): StoredUser[] {
  const parsed = safeParse(localStorage.getItem(USERS_STORAGE_KEY));

  if (!Array.isArray(parsed)) return [];

  const dedupedUsers = new Map<string, StoredUser>();

  parsed.forEach((entry) => {
    if (!isStoredUser(entry)) return;

    const email = normalizeEmail(entry.email);
    dedupedUsers.set(email, {
      email,
      password: entry.password,
    });
  });

  const users = Array.from(dedupedUsers.values());

  if (users.length !== parsed.length) {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  }

  return users;
}

export function saveStoredUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

export function findStoredUser(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return loadStoredUsers().find((user) => user.email === normalizedEmail) ?? null;
}

export function userExists(email: string) {
  return Boolean(findStoredUser(email));
}

export function registerStoredUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const users = loadStoredUsers();

  if (users.some((user) => user.email === normalizedEmail)) {
    return false;
  }

  users.push({ email: normalizedEmail, password });
  saveStoredUsers(users);
  return true;
}

export function updateStoredUserPassword(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const users = loadStoredUsers();
  const index = users.findIndex((user) => user.email === normalizedEmail);

  if (index === -1) return false;

  users[index] = {
    ...users[index],
    password,
  };

  saveStoredUsers(users);
  return true;
}

export function authenticateStoredUser(email: string, password: string) {
  const user = findStoredUser(email);

  if (!user) {
    return { ok: false as const, message: "User does not exist. Please sign up." };
  }

  if (user.password !== password) {
    return { ok: false as const, message: "Incorrect password" };
  }

  return { ok: true as const, user };
}

export function setAuthenticatedSession(email: string) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(buildSession(email)));
}

export function clearAuthenticatedSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function getAuthenticatedSession(): AuthSession | null {
  const parsed = safeParse(localStorage.getItem(SESSION_STORAGE_KEY));

  if (!parsed || typeof parsed !== "object" || !("email" in parsed) || typeof parsed.email !== "string") {
    return null;
  }

  const user = findStoredUser(parsed.email);

  if (!user) {
    clearAuthenticatedSession();
    return null;
  }

  return buildSession(user.email);
}
