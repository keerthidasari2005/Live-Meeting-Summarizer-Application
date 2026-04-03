import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import {
  SPEAKER_COLORS,
  type Meeting,
  type TranscriptEntry,
  type MeetingSummary,
  type MeetingStatus,
  type MeetingContentType,
  type Workspace,
  type AppNotification,
} from "@/types/meeting";
import { buildPrintableSummaryReport } from "@/lib/meetingReport";
import { getAuthenticatedSession } from "@/lib/auth";
import { sendNotificationEmail } from "@/lib/notificationEmail";

interface MeetingContextType {
  meetings: Meeting[];
  allMeetings: Meeting[];
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  activeWorkspaceId: string;
  notifications: AppNotification[];
  unreadNotificationCount: number;
  currentMeeting: Meeting | null;
  status: MeetingStatus;
  setActiveWorkspace: (workspaceId: string) => void;
  createWorkspace: (name: string) => Workspace | null;
  markAllNotificationsRead: () => void;
  startNewMeeting: () => void;
  addTranscriptEntry: (entry: TranscriptEntry) => void;
  setStatus: (s: MeetingStatus) => void;
  stopMeeting: () => void;
  selectMeeting: (id: string) => void;
  clearCurrentMeeting: () => void;
  addUploadedMeeting: (meeting: Meeting) => void;
}

const MeetingContext = createContext<MeetingContextType | null>(null);
const DEFAULT_RISK = "No significant risks or concerns were identified.";
const STORAGE_KEY = "meetingmind_meetings";
const WORKSPACES_STORAGE_KEY = "meetingmind_workspaces";
const ACTIVE_WORKSPACE_STORAGE_KEY = "meetingmind_active_workspace";
const NOTIFICATION_READ_STORAGE_KEY = "meetingmind_notification_read_at";
const DEFAULT_WORKSPACE: Workspace = {
  id: "workspace-default",
  name: "My Workspace",
  createdAt: "2026-03-01T00:00:00.000Z",
};
const PRIMARY_SPEAKER_LABEL = "Speaker 1";

export function useMeetingStore() {
  const ctx = useContext(MeetingContext);
  if (!ctx) throw new Error("useMeetingStore must be used within MeetingProvider");
  return ctx;
}

function splitSentences(text: string) {
  return text
    .split(/[.!?]+/)
    .filter(Boolean)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 8);
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function titleCaseSentence(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length || 0;
}

function parseStoredValue<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function isGenericBrowserSpeaker(label: string) {
  return /^speaker\s+\d+$/i.test((label || "").trim());
}

function normalizeTranscriptEntry(entry: TranscriptEntry): TranscriptEntry {
  if (!isGenericBrowserSpeaker(entry.speaker)) {
    return entry;
  }

  return {
    ...entry,
    speaker: PRIMARY_SPEAKER_LABEL,
    speakerColor: SPEAKER_COLORS[0],
  };
}

function normalizeWorkspaces(value: unknown): Workspace[] {
  const parsed = Array.isArray(value) ? value : [];
  const sanitized = parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<Workspace>;
      if (!candidate.id || !candidate.name) return null;
      return {
        id: candidate.id,
        name: candidate.name.trim() || "Untitled Workspace",
        createdAt: candidate.createdAt || new Date().toISOString(),
      };
    })
    .filter((item): item is Workspace => Boolean(item));

  const hasDefaultWorkspace = sanitized.some((workspace) => workspace.id === DEFAULT_WORKSPACE.id);
  return hasDefaultWorkspace ? sanitized : [DEFAULT_WORKSPACE, ...sanitized];
}

function normalizeMeetings(value: unknown, defaultWorkspaceId: string): Meeting[] {
  const parsed = Array.isArray(value) ? value : [];
  return parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const meeting = item as Meeting;
      if (!meeting.id || !meeting.date) return null;
      return {
        ...meeting,
        transcript: Array.isArray(meeting.transcript)
          ? meeting.transcript.map((entry) => normalizeTranscriptEntry(entry))
          : [],
        workspaceId: meeting.workspaceId || defaultWorkspaceId,
        source: meeting.source || "live",
      };
    })
    .filter((item): item is Meeting => Boolean(item));
}

function buildNotifications(
  activeWorkspace: Workspace,
  meetings: Meeting[],
  status: MeetingStatus,
  currentMeeting: Meeting | null,
  notificationReadAt: string,
): AppNotification[] {
  const referenceTime = Number.isNaN(Date.parse(notificationReadAt)) ? 0 : Date.parse(notificationReadAt);
  const recentMeetings = [...meetings]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 4);

  const baseNotifications = [
    {
      id: `workspace-${activeWorkspace.id}`,
      title: `${activeWorkspace.name} is active`,
      description:
        meetings.length > 0
          ? `${meetings.length} saved meeting${meetings.length === 1 ? "" : "s"} are available in this workspace.`
          : "This workspace is ready for recordings, uploads, and reports.",
      createdAt: activeWorkspace.createdAt,
      kind: "workspace" as const,
    },
    ...(status !== "idle"
      ? [
          {
            id: `status-${status}`,
            title: status === "recording" ? "Recording in progress" : "Meeting activity in progress",
            description:
              currentMeeting?.title ||
              "MeetingMind is working on your current session and will keep the dashboard updated.",
            createdAt: currentMeeting?.date || new Date().toISOString(),
            kind: "system" as const,
          },
        ]
      : []),
    ...(recentMeetings.length === 0
      ? [
          {
            id: `onboarding-${activeWorkspace.id}`,
            title: "Start your first workspace session",
            description: "Record a meeting or upload media to populate reports, notes, and summaries here.",
            createdAt: activeWorkspace.createdAt,
            kind: "system" as const,
          },
        ]
      : recentMeetings.map((meeting) => ({
          id: `meeting-${meeting.id}`,
          title: meeting.summary?.title || meeting.title,
          description:
            meeting.source === "upload"
              ? "Uploaded media is available in this workspace."
              : "A meeting session is available to review from the dashboard.",
          createdAt: meeting.date,
          kind: "meeting" as const,
        }))),
  ];

  return baseNotifications
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map((item) => ({
      ...item,
      read: new Date(item.createdAt).getTime() <= referenceTime,
    }));
}

function inferContentType(transcript: TranscriptEntry[]): MeetingContentType {
  const speakerNames = uniqueStrings(
    transcript.map((entry) => entry.speaker).filter((speaker) => speaker && speaker !== "Media Upload"),
  );
  const text = transcript.map((entry) => entry.text).join(" ").toLowerCase();

  const meetingSignals = countMatches(
    text,
    /\b(meeting|agenda|action item|follow[- ]?up|deadline|stakeholder|client|team|project|deliverable|decision|decided|agreed|approved|roadmap|sprint|status update|next step|owner|task)\b/gi,
  );
  const lectureSignals = countMatches(
    text,
    /\b(lecture|tutorial|lesson|concept|theory|definition|example|chapter|explain|learning|students?|class|course|instructor|teach|teaching|educational|demonstration|presentation|speech)\b/gi,
  );
  const interviewSignals =
    countMatches(text, /\b(question|answer|asked|responded|interview|conversation|discussed)\b/gi) +
    transcript.reduce((count, entry) => count + ((entry.text.match(/\?/g) || []).length > 0 ? 1 : 0), 0);

  if (speakerNames.length <= 1) {
    return "lecture";
  }

  if (lectureSignals >= meetingSignals + 2 && lectureSignals >= interviewSignals) {
    return "lecture";
  }

  if (interviewSignals >= 3 && meetingSignals <= interviewSignals) {
    return "interview";
  }

  if (meetingSignals > 0) {
    return "meeting";
  }

  return speakerNames.length >= 2 ? "interview" : "lecture";
}

function extractKeyPoints(sentences: string[]) {
  const points = sentences
    .filter((sentence) => sentence.length > 20)
    .slice(0, 6)
    .map((sentence) => titleCaseSentence(sentence));

  return points.length > 0
    ? points
    : ["The session content was captured at a high level, but no detailed discussion insights were reliably extracted."];
}

function extractDecisions(sentences: string[], contentType: MeetingContentType) {
  if (contentType !== "meeting") return [];

  return uniqueStrings(
    sentences
      .filter((sentence) =>
        /\b(decided|agreed|approved|confirmed|finalized|accepted|rejected|signed off|moving forward|will proceed)\b/i.test(
          sentence,
        ),
      )
      .slice(0, 4)
      .map((sentence) => titleCaseSentence(sentence)),
  );
}

function extractRisks(sentences: string[]) {
  return uniqueStrings(
    sentences
      .filter((sentence) => /\b(risk|concern|issue|blocker|delay|dependency|challenge|problem)\b/i.test(sentence))
      .slice(0, 4)
      .map((sentence) => titleCaseSentence(sentence)),
  );
}

function extractDeadline(text: string) {
  const match = text.match(
    /\b(by\s+[a-z0-9 ,:-]+|before\s+[a-z0-9 ,:-]+|today|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod)\b/i,
  );

  return match ? titleCaseSentence(match[0]) : "Deadline not specified";
}

function extractActionItems(transcript: TranscriptEntry[], contentType: MeetingContentType) {
  if (contentType !== "meeting") return [];

  const actionCandidates: { task: string; assignee: string; deadline: string }[] = [];

  transcript.forEach((entry) => {
    splitSentences(entry.text).forEach((sentence) => {
      if (
        /\b(need to|needs to|follow[- ]?up|please|must|should|send|share|prepare|complete|review|schedule|update|submit|deliver|coordinate|check|confirm|assign|assigned|plan to)\b/i.test(
          sentence,
        )
      ) {
        actionCandidates.push({
          task: titleCaseSentence(sentence.slice(0, 120)),
          assignee: entry.speaker && entry.speaker !== "Media Upload" ? entry.speaker : "To be assigned",
          deadline: extractDeadline(sentence),
        });
      }
    });
  });

  return uniqueStrings(actionCandidates.map((item) => `${item.task}|||${item.assignee}|||${item.deadline}`))
    .slice(0, 5)
    .map((value) => {
      const [task, assignee, deadline] = value.split("|||");
      return { task, assignee, deadline };
    });
}

function buildExecutiveSummary(
  contentType: MeetingContentType,
  source: "Live Recording" | "Uploaded Audio" | "Uploaded Video",
  keyPoints: string[],
  decisions: string[],
  actionItems: { task: string; assignee: string; deadline: string }[],
  speakers: string[],
) {
  const focus = keyPoints[0]?.toLowerCase() || "the primary session topic";

  if (contentType === "lecture") {
    return `This ${source.toLowerCase()} session primarily presented instructional or explanatory content focused on ${focus}. The session emphasized concept delivery, clarification, and organized learning takeaways rather than collaborative decision-making.`;
  }

  if (contentType === "interview") {
    return `This ${source.toLowerCase()} session was identified as an interview or structured conversation. ${speakers.length} participant(s) contributed to a question-and-answer style exchange centered on ${focus}.`;
  }

  return `This ${source.toLowerCase()} meeting focused on ${focus}. ${speakers.length} participant(s) contributed to the discussion, ${decisions.length} formal decision(s) were identified, and ${actionItems.length} follow-up action item(s) were captured for execution.`;
}

function buildNextSteps(
  contentType: MeetingContentType,
  actionItems: { task: string; assignee: string; deadline: string }[],
  decisions: string[],
) {
  if (contentType === "lecture") {
    return [
      "Review the summarized concepts and explanations for retention.",
      "Apply the discussed ideas or methods in further study or practice where relevant.",
      "Revisit the session material if additional clarification is required.",
    ];
  }

  if (contentType === "interview") {
    return [
      "Review the main responses and insights captured during the conversation.",
      "Refer back to the summary for any follow-up interpretation or documentation needs.",
      "Use the extracted insights to support subsequent discussion or decision-making if required.",
    ];
  }

  return uniqueStrings([
    ...(actionItems.length > 0 ? ["Execute the identified action items within the agreed timelines."] : []),
    ...(decisions.length > 0 ? ["Review the documented decisions and communicate them to relevant stakeholders."] : []),
    "Share the meeting summary with relevant participants for alignment.",
    "Schedule follow-up tracking if open items remain unresolved.",
  ]);
}

function buildConclusion(
  contentType: MeetingContentType,
  speakers: string[],
  actionItems: { task: string; assignee: string; deadline: string }[],
) {
  if (contentType === "lecture") {
    return "The session concluded with a clear instructional focus and produced a structured set of concepts and takeaways suitable for later review and application.";
  }

  if (contentType === "interview") {
    return "The conversation concluded with a structured exchange of information and a set of documented insights suitable for reference and follow-up interpretation.";
  }

  return `The meeting concluded with ${speakers.length} participant(s) aligned on the primary discussion points. ${actionItems.length} action item(s) were documented to support follow-through after the session.`;
}

export function generateSummary(
  transcript: TranscriptEntry[],
  source: "Live Recording" | "Uploaded Audio" | "Uploaded Video" = "Live Recording",
): MeetingSummary {
  const speakers = uniqueStrings(
    transcript.map((entry) => entry.speaker).filter((speaker) => speaker && speaker !== "Media Upload"),
  );
  const allText = transcript.map((entry) => entry.text).join(" ");
  const sentences = splitSentences(allText);
  const contentType = inferContentType(transcript);
  const keyPoints = extractKeyPoints(sentences);
  const decisions = extractDecisions(sentences, contentType);
  const actionItems = extractActionItems(transcript, contentType);
  const risks = extractRisks(sentences);
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const participantList = contentType === "lecture" ? [] : speakers;
  const summaryTitle =
    keyPoints[0]?.slice(0, 90) ||
    (contentType === "lecture"
      ? "Educational Session Summary"
      : contentType === "interview"
        ? "Interview Summary"
        : "Meeting Summary");

  const summary: MeetingSummary = {
    title: summaryTitle,
    date: dateStr,
    participants: participantList,
    executiveSummary: buildExecutiveSummary(contentType, source, keyPoints, decisions, actionItems, speakers),
    keyPoints,
    decisions,
    actionItems,
    nextSteps: buildNextSteps(contentType, actionItems, decisions),
    conclusion: buildConclusion(contentType, speakers, actionItems),
    risks: risks.length > 0 ? risks : [DEFAULT_RISK],
    contentType,
  };

  summary.printableReport = buildPrintableSummaryReport(summary, {
    meetingDate: new Date().toISOString(),
    transcript,
    meetingTitle: summary.title,
  });

  return summary;
}

export function MeetingProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() =>
    normalizeWorkspaces(parseStoredValue<Workspace[]>(WORKSPACES_STORAGE_KEY, [DEFAULT_WORKSPACE])),
  );
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>(() => {
    const stored = localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    return stored || DEFAULT_WORKSPACE.id;
  });
  const [notificationReadAt, setNotificationReadAt] = useState<string>(() => localStorage.getItem(NOTIFICATION_READ_STORAGE_KEY) || "");
  const [allMeetings, setAllMeetings] = useState<Meeting[]>(() =>
    normalizeMeetings(parseStoredValue<Meeting[]>(STORAGE_KEY, []), DEFAULT_WORKSPACE.id),
  );
  const [currentMeeting, setCurrentMeeting] = useState<Meeting | null>(null);
  const [status, setStatus] = useState<MeetingStatus>("idle");

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ||
    workspaces[0] ||
    DEFAULT_WORKSPACE;
  const meetings = allMeetings.filter(
    (meeting) => (meeting.workspaceId || DEFAULT_WORKSPACE.id) === activeWorkspace.id,
  );
  const notifications = buildNotifications(activeWorkspace, meetings, status, currentMeeting, notificationReadAt);
  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allMeetings));
  }, [allMeetings]);

  useEffect(() => {
    localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, activeWorkspace.id);
  }, [activeWorkspace.id]);

  useEffect(() => {
    localStorage.setItem(NOTIFICATION_READ_STORAGE_KEY, notificationReadAt);
  }, [notificationReadAt]);

  useEffect(() => {
    if (!workspaces.some((workspace) => workspace.id === activeWorkspaceId)) {
      setActiveWorkspaceIdState(workspaces[0]?.id || DEFAULT_WORKSPACE.id);
    }
  }, [workspaces, activeWorkspaceId]);

  useEffect(() => {
    if (currentMeeting && (currentMeeting.workspaceId || DEFAULT_WORKSPACE.id) !== activeWorkspace.id) {
      setCurrentMeeting(null);
    }
  }, [activeWorkspace.id, currentMeeting]);

  const setActiveWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspaceIdState(workspaceId);
  }, []);

  const createWorkspace = useCallback(
    (name: string) => {
      const normalizedName = name.trim();
      if (!normalizedName) return null;

      const existing = workspaces.find(
        (workspace) => workspace.name.toLowerCase() === normalizedName.toLowerCase(),
      );
      if (existing) {
        setActiveWorkspaceIdState(existing.id);
        return existing;
      }

      const workspace: Workspace = {
        id: crypto.randomUUID(),
        name: normalizedName,
        createdAt: new Date().toISOString(),
      };

      setWorkspaces((current) => [workspace, ...current]);
      setActiveWorkspaceIdState(workspace.id);
      return workspace;
    },
    [workspaces],
  );

  const markAllNotificationsRead = useCallback(() => {
    setNotificationReadAt(new Date().toISOString());
  }, []);

  const sendLifecycleEmail = useCallback(
    (payload: { subject: string; headline: string; message: string; details?: string[] }) => {
      const session = getAuthenticatedSession();
      if (!session?.email) return;

      void sendNotificationEmail({
        toEmail: session.email,
        ...payload,
      }).catch((error) => {
        console.warn("Notification email could not be sent.", error);
      });
    },
    [],
  );

  const startNewMeeting = useCallback(() => {
    const meeting: Meeting = {
      id: crypto.randomUUID(),
      title: `Meeting - ${new Date().toLocaleString()}`,
      date: new Date().toISOString(),
      duration: "0:00",
      transcript: [],
      summary: null,
      status: "recording",
      workspaceId: activeWorkspace.id,
      source: "live",
    };
    setCurrentMeeting(meeting);
    setStatus("recording");
    sendLifecycleEmail({
      subject: "MeetingMate AI meeting started",
      headline: "Meeting recording started",
      message: "Your live meeting has started in MeetingMate AI.",
      details: [`Workspace: ${activeWorkspace.name}`, `Meeting: ${meeting.title}`],
    });
  }, [activeWorkspace.id, activeWorkspace.name, sendLifecycleEmail]);

  const addTranscriptEntry = useCallback((entry: TranscriptEntry) => {
    const normalizedEntry = normalizeTranscriptEntry(entry);
    setCurrentMeeting((prev) => (prev ? { ...prev, transcript: [...prev.transcript, normalizedEntry] } : prev));
  }, []);

  const stopMeeting = useCallback(() => {
    setStatus("generating");
    setTimeout(() => {
      setCurrentMeeting((prev) => {
        if (!prev) return prev;
        const computedDuration = `${Math.floor(prev.transcript.length * 0.5)}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`;
        const generatedSummary = generateSummary(prev.transcript);
        const summary: MeetingSummary = {
          ...generatedSummary,
          printableReport: buildPrintableSummaryReport(generatedSummary, {
            meetingDate: prev.date,
            transcript: prev.transcript,
            meetingTitle: prev.title,
            duration: computedDuration,
          }),
        };
        const completed: Meeting = {
          ...prev,
          summary,
          status: "completed",
          duration: computedDuration,
        };
        setAllMeetings((existingMeetings) => [completed, ...existingMeetings]);
        setStatus("completed");
        sendLifecycleEmail({
          subject: "MeetingMate AI summary ready",
          headline: "Your meeting summary is ready",
          message: "MeetingMate AI finished generating the summary for your live meeting.",
          details: [
            `Workspace: ${activeWorkspace.name}`,
            `Meeting: ${completed.summary?.title || completed.title}`,
            `Action items: ${completed.summary?.actionItems?.length || 0}`,
            `Decisions: ${completed.summary?.decisions?.length || 0}`,
          ],
        });
        return completed;
      });
    }, 2000);
  }, [activeWorkspace.name, sendLifecycleEmail]);

  const selectMeeting = useCallback(
    (id: string) => {
      const meeting = allMeetings.find(
        (item) => item.id === id && (item.workspaceId || DEFAULT_WORKSPACE.id) === activeWorkspace.id,
      );
      if (meeting) {
        setCurrentMeeting(meeting);
        setStatus("completed");
      }
    },
    [allMeetings, activeWorkspace.id],
  );

  const clearCurrentMeeting = useCallback(() => {
    setCurrentMeeting(null);
    setStatus("idle");
  }, []);

  const addUploadedMeeting = useCallback((meeting: Meeting) => {
    const nextMeeting: Meeting = {
      ...meeting,
      workspaceId: meeting.workspaceId || activeWorkspace.id,
      source: meeting.source || "upload",
    };
    setAllMeetings((existingMeetings) => [nextMeeting, ...existingMeetings]);
  }, [activeWorkspace.id]);

  return (
    <MeetingContext.Provider
      value={{
        meetings,
        allMeetings,
        workspaces,
        activeWorkspace,
        activeWorkspaceId: activeWorkspace.id,
        notifications,
        unreadNotificationCount,
        currentMeeting,
        status,
        setActiveWorkspace,
        createWorkspace,
        markAllNotificationsRead,
        startNewMeeting,
        addTranscriptEntry,
        setStatus,
        stopMeeting,
        selectMeeting,
        clearCurrentMeeting,
        addUploadedMeeting,
      }}
    >
      {children}
    </MeetingContext.Provider>
  );
}
