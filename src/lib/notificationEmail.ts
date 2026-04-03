import { normalizeEmail } from "@/lib/auth";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

type NotificationEmailOptions = {
  toEmail: string;
  subject: string;
  headline: string;
  message: string;
  details?: string[];
};

function getNotificationEndpoints() {
  const endpoints = new Set<string>();

  if (API_BASE_URL) {
    endpoints.add(`${API_BASE_URL}/api/send-notification-email`);
  }

  endpoints.add("/api/send-notification-email");
  return Array.from(endpoints);
}

export async function sendNotificationEmail({ toEmail, subject, headline, message, details = [] }: NotificationEmailOptions) {
  const normalizedEmail = normalizeEmail(toEmail);
  let lastNetworkError: unknown = null;

  for (const endpoint of getNotificationEndpoints()) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to_email: normalizedEmail,
          subject,
          headline,
          message,
          details,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.message || payload.error || "Failed to send the notification email.");
      }

      return payload;
    } catch (error) {
      if (error instanceof TypeError) {
        lastNetworkError = error;
        continue;
      }

      throw error;
    }
  }

  throw (lastNetworkError instanceof Error ? lastNetworkError : new Error("Failed to send the notification email."));
}
