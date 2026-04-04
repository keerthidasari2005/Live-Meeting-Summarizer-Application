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
  filename?: string;
  original_filename?: string;
  size_bytes?: number;
};

type UploadJobResponse = UploadApiResponse & {
  job_id?: string;
  status?: JobStatus;
  stage?: string;
  progress?: number;
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

async function parseUploadResponseData(response: Response): Promise<UploadJobResponse & { rawText?: string }> {
  const rawText = await response.text();

  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText) as UploadJobResponse;
  } catch {
    return {
      rawText,
      error: rawText,
      message: rawText,
    };
  }
}

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

const isDirectUploadResponse = (payload: UploadJobResponse) =>
  !payload.job_id && Boolean(payload.filename);

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

  const uploadInChunks = async (file: File): Promise<UploadJobResponse> => {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB raw chunks to optimize speed, still safe for Render
    const MAX_PARALLEL = 3;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    const initResponse = await fetch(`${API_BASE_URL}/upload_init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename: file.name,
        total_chunks: totalChunks,
        file_size: file.size,
        mime_type: file.type,
      }),
    });

    if (!initResponse.ok) {
      const responseData = await parseUploadResponseData(initResponse);
      throw new Error(responseData.error || responseData.message || "Upload initialization failed.");
    }

    const initData = await initResponse.json();
    const uploadId = initData.upload_id;

    if (!uploadId) {
      throw new Error("Upload session could not be created.");
    }

    const uploadChunk = async (index: number) => {
      const chunk = file.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
      const formData = new FormData();
      formData.append("upload_id", uploadId);
      formData.append("chunk_index", String(index));
      formData.append("chunk", chunk, `${file.name}.part-${index}`);

      const response = await fetch(`${API_BASE_URL}/upload_chunk`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const responseData = await parseUploadResponseData(response);
        throw new Error(responseData.error || responseData.message || `Chunk ${index} upload failed.`);
      }
    };

    let completedChunks = 0;
    for (let start = 0; start < totalChunks; start += MAX_PARALLEL) {
      const batchIndexes = Array.from(
        { length: Math.min(MAX_PARALLEL, totalChunks - start) },
        (_, idx) => start + idx,
      );

      await Promise.all(batchIndexes.map(async (chunkIndex) => {
        await uploadChunk(chunkIndex);
        completedChunks += 1;
        setUploadProgress(Math.round((completedChunks / totalChunks) * 60));
      }));
    }

    setUploadProgress(65);
    const processResponse = await fetch(`${API_BASE_URL}/process_upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ upload_id: uploadId }),
    });

    const data = await parseUploadResponseData(processResponse);
    if (!processResponse.ok) {
      throw new Error(data.error || data.message || "File processing failed.");
    }

    setUploadProgress(100);
    return data;
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
    if (!file) return;

    setIsUploading(true);
    setSummary(null);
    setExportSummary(null);
    resetJobState();

    try {
      const data = await uploadInChunks(file);
      console.log(data);

      const transcriptText = typeof data.transcript === "string" ? data.transcript.trim() : "";
      const summaryText = typeof data.summary === "string" ? data.summary.trim() : "";

      setSummary(summaryText || null);
      setUploadProgress(100);
      setJob({
        ...data,
        job_id: data.filename || crypto.randomUUID(),
        status: "completed",
        stage: "uploaded",
        progress: 100,
        upload: {
          filename: data.filename,
          size_mb: typeof data.size_bytes === "number" ? data.size_bytes / (1024 * 1024) : undefined,
        },
      });

      if (transcriptText) {
        const transcriptEntries = [
          {
            id: crypto.randomUUID(),
            timestamp: "0:00",
            speaker: "Media Upload",
            text: transcriptText,
            speakerColor: "hsl(280 60% 55%)",
          },
        ];

        const structuredSummary = generateSummary(
          transcriptEntries,
          file.type.startsWith("video") ? "Uploaded Video" : "Uploaded Audio",
        );
        structuredSummary.printableReport = summaryText || structuredSummary.printableReport;
        setExportSummary(structuredSummary);

        addUploadedMeeting({
          id: crypto.randomUUID(),
          title: file.name || data.original_filename || "Uploaded media",
          date: new Date().toISOString(),
          duration: "Not specified",
          transcript: transcriptEntries,
          summary: structuredSummary,
          status: "completed",
          source: "upload",
        });
      } else {
        // If no transcript but we have a summary, create a basic export summary
        if (summaryText) {
          const basicSummary = {
            id: crypto.randomUUID(),
            executiveSummary: summaryText,
            keyPoints: [],
            actionItems: [],
            decisions: [],
            nextSteps: [],
            printableReport: summaryText,
            meetingDate: new Date().toISOString(),
            duration: "Not specified",
            participants: [],
          };
          setExportSummary(basicSummary);

          addUploadedMeeting({
            id: crypto.randomUUID(),
            title: file.name || data.original_filename || "Uploaded media",
            date: new Date().toISOString(),
            duration: "Not specified",
            transcript: [],
            summary: basicSummary,
            status: "completed",
            source: "upload",
          });
        }
      }

      toast({
        title: "Summary ready",
        description: data.message || "File uploaded and summarized successfully.",
      });
    } catch (error: unknown) {
      console.error("Upload failed:", error);
      const description = error instanceof Error ? error.message : "Upload failed.";
      setJob({
        job_id: crypto.randomUUID(),
        status: "failed",
        stage: "upload",
        progress: 0,
        message: description,
      });
      toast({
        title: "Upload failed",
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
  const progressTitle = isUploading
    ? "Uploading Media"
    : job?.status === "completed" && !summary
      ? "Upload Complete"
      : "Background Processing";
  const progressDescription = job?.message
    || (job?.status === "completed" && !summary
      ? "Your file was uploaded successfully."
      : "Your file is being uploaded and queued for background processing.");

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
            <CardTitle>{progressTitle}</CardTitle>
            <CardDescription>
              {progressDescription}
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
