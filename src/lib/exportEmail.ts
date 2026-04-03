import { normalizeEmail } from "@/lib/auth";
import { buildReportExportFile, type ExportReportOptions } from "@/lib/reportExport";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

type SendExportEmailOptions = ExportReportOptions & {
  toEmail: string;
};

type SendExportEmailResponse = {
  success?: boolean;
  message?: string;
  error?: string;
};

function getExportEmailEndpoints() {
  const endpoints = new Set<string>();

  if (API_BASE_URL) {
    endpoints.add(`${API_BASE_URL}/api/send-export-email`);
  }

  endpoints.add("/api/send-export-email");
  return Array.from(endpoints);
}

async function getBackendReachabilityError() {
  const healthEndpoints = new Set<string>();

  if (API_BASE_URL) {
    healthEndpoints.add(`${API_BASE_URL}/api/health`);
  }

  healthEndpoints.add("/api/health");

  for (const endpoint of healthEndpoints) {
    try {
      const response = await fetch(endpoint);

      if (!response.ok) {
        continue;
      }

      return null;
    } catch {
      continue;
    }
  }

  return new Error("Could not reach the mail backend. Start the Flask API with `npm run dev` or `python backend/app.py`.");
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not encode the export attachment."));
        return;
      }

      const [, encoded = ""] = reader.result.split(",", 2);
      resolve(encoded);
    };

    reader.onerror = () => {
      reject(reader.error || new Error("Could not encode the export attachment."));
    };

    reader.readAsDataURL(blob);
  });
}

export async function sendExportEmail({
  toEmail,
  title,
  reportText,
  format,
  visualSection,
}: SendExportEmailOptions) {
  const normalizedEmail = normalizeEmail(toEmail);
  const exportFile = await buildReportExportFile({
    title,
    reportText,
    format,
    visualSection,
  });
  const fileContentBase64 = await blobToBase64(exportFile.blob);
  const requestBody = JSON.stringify({
    to_email: normalizedEmail,
    report_title: title,
    export_format: format,
    file_name: exportFile.fileName,
    file_content_base64: fileContentBase64,
    mime_type: exportFile.mimeType,
  });

  let lastNetworkError: unknown = null;

  for (const endpoint of getExportEmailEndpoints()) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      const payload = (await response.json().catch(() => ({}))) as SendExportEmailResponse;

      if (!response.ok) {
        throw new Error(payload.message || payload.error || "Failed to send the export email.");
      }

      return {
        ...payload,
        fileName: exportFile.fileName,
        toEmail: normalizedEmail,
      };
    } catch (error) {
      if (error instanceof TypeError) {
        lastNetworkError = error;
        continue;
      }

      throw error;
    }
  }

  const backendError = await getBackendReachabilityError();

  if (backendError) {
    throw backendError;
  }

  throw (lastNetworkError instanceof Error
    ? new Error(`${lastNetworkError.message}. The mail backend is reachable, so check the browser network tab for the blocked request.`)
    : new Error("Failed to send the export email."));
}
