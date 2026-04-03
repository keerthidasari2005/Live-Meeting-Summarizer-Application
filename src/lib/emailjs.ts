import { OTP_EXPIRY_MINUTES } from "@/lib/otp";
import type { OtpPurpose } from "@/types/auth";

const EMAILJS_SEND_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";

type SendOtpEmailParams = {
  toEmail: string;
  otp: string;
  purpose: OtpPurpose;
};

function getEmailJsConfig() {
  return {
    serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID?.trim(),
    templateId: import.meta.env.VITE_EMAILJS_TEMPLATE_ID?.trim(),
    publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY?.trim(),
    accessToken: import.meta.env.VITE_EMAILJS_ACCESS_TOKEN?.trim(),
  };
}

export function getEmailJsConfigError() {
  const config = getEmailJsConfig();

  if (!config.serviceId) return "EmailJS is not configured. Add VITE_EMAILJS_SERVICE_ID to your .env file.";
  if (!config.templateId) return "EmailJS is not configured. Add VITE_EMAILJS_TEMPLATE_ID to your .env file.";
  if (!config.publicKey) return "EmailJS is not configured. Add VITE_EMAILJS_PUBLIC_KEY to your .env file.";

  return null;
}

export async function sendOtpEmail({ toEmail, otp, purpose }: SendOtpEmailParams) {
  const configError = getEmailJsConfigError();

  if (configError) {
    throw new Error(configError);
  }

  const config = getEmailJsConfig();
  const response = await fetch(EMAILJS_SEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service_id: config.serviceId,
      template_id: config.templateId,
      user_id: config.publicKey,
      accessToken: config.accessToken || undefined,
      template_params: {
        email: toEmail,
        to_email: toEmail,
        passcode: otp,
        time: `${OTP_EXPIRY_MINUTES} minutes`,
        otp: otp,
        code: otp,
        otp_code: otp,
        otp_purpose: purpose === "signup" ? "sign up verification" : "password reset",
        otp_expiry_minutes: OTP_EXPIRY_MINUTES,
        otp_expiry_text: `${OTP_EXPIRY_MINUTES} minutes`,
        app_name: "MeetingMate AI",
        message: `Your OTP is ${otp}. It is valid for ${OTP_EXPIRY_MINUTES} minutes.`,
      },
    }),
  });

  if (!response.ok) {
    const errorMessage = (await response.text()) || "EmailJS failed to send the OTP.";
    throw new Error(errorMessage);
  }
}
