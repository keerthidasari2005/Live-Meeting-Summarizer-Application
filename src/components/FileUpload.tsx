import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload as UploadIcon, FileAudio, FileVideo, Loader2, File, CheckCircle2, Download, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportEmailButton } from "@/components/ReportEmailButton";
import { useMeetingStore, generateSummary } from "@/hooks/useMeetingStore";
import { buildPrintableSummaryReport, buildVisualizationSection } from "@/lib/meetingReport";
import { exportReport } from "@/lib/reportExport";
import { getAuthenticatedSession } from "@/lib/auth";
import type { MeetingSummary } from "@/types/meeting";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB || 250);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const UPLOAD_REQUEST_TIMEOUT_MS = 20 * 60 * 1000;
const JOB_POLL_INTERVAL_MS = 2500;

type JobStatus = "uploaded" | "queued" | "processing" | "completed" | "completed_with_warnings" | "failed";

type UploadApiResponse = {
  error?: string;
  message?: string;
  max_upload_mb?: number;
  next_step?: string;
};

type UploadJobResponse = UploadApiResponse & {
  job_id: string;
  status: JobStatus;
  stage: string;
  progress: number;
  status_url?: string;
  process_url?: string;
  warnings?: string[];
  upload?: {
    filename?: string;
    size_mb?: number;
  };
  chunk_count?: number;
  successful_chunks?: number;
  failed_chunks?: number;
  transcript?: string;
  summary?: string;
};

class UploadApiError extends Error {
  status: number;
  payload: UploadApiResponse;

  constructor(status: number, message: string, payload: UploadApiResponse = {}) {
    super(message);
    this.name = "UploadApiError";
    this.status = status;
    this.payload = payload;
  }
}

const isTerminalStatus = (status?: JobStatus) =>
  status === "completed" || status === "completed_with_warnings" || status === "failed";

async function parseResponseJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({} as T));
}

function parseXhrPayload(xhr: XMLHttpRequest): UploadJobResponse {
  if (xhr.response && typeof xhr.response === "object") {
    return xhr.response as UploadJobResponse;
  }

  if (!xhr.responseText) {
    return {} as UploadJobResponse;
  }

  try {
    return JSON.parse(xhr.responseText) as UploadJobResponse;
  } catch {
    return {} as UploadJobResponse;
  }
}

function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void,
): Promise<UploadJobResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.timeout = UPLOAD_REQUEST_TIMEOUT_MS;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onerror = () => reject(new TypeError("Failed to fetch"));
    xhr.ontimeout = () => reject(new Error("Upload request timed out."));

    xhr.onload = () => {
      const payload = parseXhrPayload(xhr);

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
        return;
      }

      reject(
        new UploadApiError(
          xhr.status,
          payload.message || "Failed to start background processing.",
          payload,
        ),
      );
    };

    xhr.send(formData);
  });
}

export function FileUpload() {
  const session = getAuthenticatedSession();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [job, setJob] = useState<UploadJobResponse | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [exportSummary, setExportSummary] = useState<MeetingSummary | null>(null);
  const { toast } = useToast();
  const { addUploadedMeeting } = useMeetingStore();
  const pollTimeoutRef = useRef<number | null>(null);
  const exportTitle = `${file?.name || "Summary"} Analysis`;
  const visualSection = exportSummary ? buildVisualizationSection(exportSummary) : "";

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        window.clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  const clearPolling = () => {
    if (pollTimeoutRef.current) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  };

  const resetJobState = () => {
    clearPolling();
    setUploadProgress(0);
    setJob(null);
  };

  const handleDownload = async (format: "pdf" | "docx") => {
    if (!summary) return;
    await exportReport({
      title: exportTitle,
      reportText: summary,
      format,
      visualSection,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = e.target.files?.[0] || null;
    if (!nextFile) return;

    if (nextFile.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setSummary(null);
      setExportSummary(null);
      resetJobState();
      e.target.value = "";
      toast({
        title: "File too large",
        description: `This app currently accepts uploads up to ${MAX_UPLOAD_MB} MB. For bigger media, use direct-to-storage chunk upload and background processing.`,
        variant: "destructive",
      });
      return;
    }

    setFile(nextFile);
    setSummary(null);
    setExportSummary(null);
    resetJobState();
  };

  const finalizeCompletedJob = (payload: UploadJobResponse) => {
    const transcriptText = (payload.transcript || "").trim();

    const parsedSummary = generateSummary(
      [{ id: "upload-1", speaker: "Speaker 1", text: transcriptText || "Transcript unavailable.", timestamp: "0:00", speakerColor: "#000" }],
      file?.type.startsWith("video") ? "Uploaded Video" : "Uploaded Audio",
    );

    const printableSummary = buildPrintableSummaryReport(parsedSummary, {
      meetingDate: new Date().toISOString(),
      transcript: transcriptText,
      meetingTitle: exportTitle,
    });

    parsedSummary.printableReport = printableSummary;
    setSummary(printableSummary);
    setExportSummary(parsedSummary);
    setJob(payload);

    addUploadedMeeting({
      id: crypto.randomUUID(),
      title: `${file?.name || payload.upload?.filename || "Upload"} - Analysis`,
      date: new Date().toISOString(),
      duration: "Not specified",
      transcript: [
        {
          id: crypto.randomUUID(),
          timestamp: "0:00",
          speaker: "Media Upload",
          text: transcriptText || "Transcript unavailable.",
          speakerColor: "hsl(280 60% 55%)",
        },
      ],
      summary: parsedSummary,
      status: "completed",
    });

    toast({
      title: payload.status === "completed_with_warnings" ? "Summary ready with warnings" : "Analysis complete",
      description: payload.warnings?.[0] || "Your file has been processed and summarized in the background.",
    });
  };

  const pollJobStatus = async (jobId: string, retryCount = 0) => {
    try {
      const statusUrl = job?.status_url || `/api/status/${jobId}`;
      const response = await fetch(`${API_BASE_URL}${statusUrl}`);
      const payload = await parseResponseJson<UploadJobResponse>(response);

      if (!response.ok) {
        throw new UploadApiError(
          response.status,
          payload.message || "Failed to fetch background job status.",
          payload,
        );
      }

      setJob(payload);

      if (isTerminalStatus(payload.status)) {
        clearPolling();
        if (payload.status === "failed") {
          setJob(payload);
          toast({
            title: "Processing failed",
            description: payload.message || "Background processing failed.",
            variant: "destructive",
          });
          return;
        }
        finalizeCompletedJob(payload);
        return;
      }

      pollTimeoutRef.current = window.setTimeout(() => {
        void pollJobStatus(jobId);
      }, JOB_POLL_INTERVAL_MS);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Job polling failed.";

      if (retryCount < 3) {
        pollTimeoutRef.current = window.setTimeout(() => {
          void pollJobStatus(jobId, retryCount + 1);
        }, JOB_POLL_INTERVAL_MS * (retryCount + 1));
        return;
      }

      clearPolling();
      setJob((current) =>
        current
          ? { ...current, status: "failed", message: errorMessage }
          : current,
      );
      toast({
        title: "Processing failed",
        description: errorMessage || "Could not fetch the background processing result.",
        variant: "destructive",
      });
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select an audio or video file first.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setSummary(null);
    setExportSummary(null);
    resetJobState();

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (session?.email) {
        formData.append("notify_email", session.email);
      }

      const uploadPayload = await uploadWithProgress(
        `${API_BASE_URL}/api/upload`,
        formData,
        setUploadProgress,
      );

      setIsUploading(false);
      setJob(uploadPayload);
      setUploadProgress(100);

      const processPath = uploadPayload.process_url || "/api/process";
      const processResponse = await fetch(`${API_BASE_URL}${processPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: uploadPayload.job_id,
          notify_email: session?.email || undefined,
        }),
      });
      const payload = await parseResponseJson<UploadJobResponse>(processResponse);

      if (!processResponse.ok) {
        throw new UploadApiError(
          processResponse.status,
          payload.message || "Failed to start background processing.",
          payload,
        );
      }

      setJob(payload);

      if (isTerminalStatus(payload.status)) {
        if (payload.status === "failed") {
          throw new UploadApiError(500, payload.message || "Background processing failed.", payload);
        }
        finalizeCompletedJob(payload);
        return;
      }

      toast({
        title: "Processing started",
        description: payload.message || "Your media was uploaded and queued for background processing.",
      });

      await pollJobStatus(payload.job_id);
    } catch (error: unknown) {
      console.error("Upload API Error:", error);
      const apiError = error instanceof UploadApiError ? error : null;
      const payload = apiError?.payload || {};
      const baseErrorMessage = error instanceof Error ? error.message : "";
      const errorMessage = baseErrorMessage.toLowerCase();
      let description = payload.message || baseErrorMessage || "Failed to analyze the media using the AI.";

      if (errorMessage.includes("timed out")) {
        description = "The upload took too long to reach the backend. Keep nginx and Flask timeouts aligned for large media.";
      } else if (error instanceof TypeError && errorMessage.includes("failed to fetch")) {
        const apiTarget = API_BASE_URL || "the Vite /api proxy";
        description = `Could not reach the upload API via ${apiTarget}. Start the Flask backend with 'npm run dev:backend' or 'npm run dev:all'.`;
      } else if (apiError?.status === 413) {
        description = payload.message
          || `The file exceeds the ${payload.max_upload_mb || MAX_UPLOAD_MB} MB upload limit. ${payload.next_step || ""}`.trim();
      }

      setJob((current) =>
        current
          ? { ...current, status: "failed", message: description }
          : null,
      );
      toast({
        title: "Error processing file",
        description,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = () => {
    if (!file) return <UploadIcon className="h-10 w-10 text-muted-foreground mb-4" />;
    if (file.type.startsWith("video")) return <FileVideo className="h-10 w-10 text-primary mb-4" />;
    if (file.type.startsWith("audio")) return <FileAudio className="h-10 w-10 text-primary mb-4" />;
    return <File className="h-10 w-10 text-primary mb-4" />;
  };

  const isBusy = isUploading || (job !== null && !isTerminalStatus(job.status));
  const currentProgress = isUploading ? uploadProgress : job?.progress || 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Audio or Video</CardTitle>
          <CardDescription>
            Supported formats: MP3, WAV, M4A, MP4, WebM, OGG. Large long-form uploads up to {MAX_UPLOAD_MB} MB are processed in the background.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-10 bg-muted/20 hover:bg-muted/30 transition-colors">
            {getFileIcon()}

            <p className="mb-2 text-sm font-medium">
              {file ? file.name : "Select a media file to summarize"}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              {file
                ? `${(file.size / (1024 * 1024)).toFixed(2)} MB selected`
                : "Click below to browse files, including long audio or video recordings"}
            </p>

            <input
              type="file"
              id="file-upload"
              accept=".mp3,.wav,.m4a,.mp4,.webm,.ogg,audio/*,video/*"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="flex gap-4">
              <Button asChild variant="outline">
                <label htmlFor="file-upload" className="cursor-pointer">
                  Browse Files
                </label>
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!file || isBusy}
                className="min-w-[160px]"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : isBusy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Upload & Summarize"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {(isBusy || job) && (
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle>{isUploading ? "Uploading Media" : "Background Processing"}</CardTitle>
            <CardDescription>
              {job?.message || "Your file is being uploaded and queued for background processing."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.max(6, currentProgress)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{currentProgress}% complete</span>
              <span>{job?.stage || (isUploading ? "uploading" : "queued")}</span>
            </div>
            {job?.warnings && job.warnings.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {job.warnings.slice(0, 2).map((warning, index) => (
                  <p key={index}>{warning}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Processing Complete
              </CardTitle>
              <CardDescription>AI-generated meeting summary report</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void handleDownload("pdf")} className="gap-2">
                <Download className="h-4 w-4" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleDownload("docx")} className="gap-2">
                <FileText className="h-4 w-4" /> DOCX
              </Button>
              <ReportEmailButton
                title={exportTitle}
                reportText={summary}
                visualSection={visualSection}
                triggerLabel="Email"
                triggerVariant="outline"
                triggerSize="sm"
                buttonClassName="gap-2"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap">
              {summary}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
