export interface TranscriptEntry {
  id: string;
  timestamp: string;
  speaker: string;
  text: string;
  speakerColor: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: string;
  transcript: TranscriptEntry[];
  summary: MeetingSummary | null;
  status: MeetingStatus;
  workspaceId?: string;
  source?: "live" | "upload";
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  kind: "workspace" | "meeting" | "system";
  read: boolean;
}

export interface MeetingSummary {
  title: string;
  date: string;
  participants: string[];
  executiveSummary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: { task: string; assignee: string; deadline: string }[];
  nextSteps: string[];
  conclusion: string;
  risks?: string[];
  printableReport?: string;
  contentType?: MeetingContentType;
}

export type MeetingStatus =
  | "idle"
  | "recording"
  | "listening"
  | "transcribing"
  | "processing"
  | "generating"
  | "completed";

export type MeetingContentType = "meeting" | "lecture" | "interview";

export const SPEAKER_COLORS = [
  "hsl(175 70% 38%)",
  "hsl(195 85% 48%)",
  "hsl(155 65% 42%)",
  "hsl(280 60% 55%)",
  "hsl(30 80% 55%)",
  "hsl(340 70% 55%)",
];
