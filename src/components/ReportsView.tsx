import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  ListChecks,
  Loader2,
  Mail,
  MoreVertical,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { format, isValid, parseISO, subDays } from "date-fns";
import { useSearchParams } from "react-router-dom";
import { useMeetingStore } from "@/hooks/useMeetingStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getAuthenticatedSession, normalizeEmail } from "@/lib/auth";
import { sendExportEmail } from "@/lib/exportEmail";
import {
  buildPrintableSummaryReport,
  buildVisualizationSection,
  getSummaryVisualMetrics,
  type SummaryVisualMetric,
} from "@/lib/meetingReport";
import { getMeetingNotesForSession, loadMeetingNotes } from "@/lib/meetingNotes";
import { exportReport, type ReportExportFormat } from "@/lib/reportExport";
import { cn } from "@/lib/utils";
import type { Meeting } from "@/types/meeting";

type DateRangeOption = "7" | "30" | "90" | "all";
type ReportEntryContentType = "meeting" | "lecture" | "interview" | "general";

type ReportEntry = {
  id: string;
  meetingId?: string;
  source: string;
  title: string;
  processing: boolean;
  dateValue: string;
  dateLabel: string;
  timeLabel: string;
  score: number;
  tag: string;
  owner: string;
  icon: LucideIcon;
  color: string;
  participantCount: number;
  actionCount: number;
  decisionCount: number;
  riskCount: number;
  keyPointCount: number;
  contentType: ReportEntryContentType;
  preview: string;
  highlights: string[];
  visualMetrics: SummaryVisualMetric[];
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRO_MODE_STORAGE_KEY = "meetingmind_reports_pro_mode";

const dateRangeLabels: Record<DateRangeOption, string> = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
  all: "All time",
};

const fallbackEntries: ReportEntry[] = [
  {
    id: "fallback-1",
    source: "MeetingMind Sync",
    title: "Weekly product standup summary",
    processing: false,
    dateValue: "2026-03-29T21:30:00.000Z",
    dateLabel: "29/03/2026",
    timeLabel: "09:30 PM",
    score: 91,
    tag: "Summary",
    owner: "MeetingMind AI",
    icon: Video,
    color: "text-violet-500",
    participantCount: 3,
    actionCount: 4,
    decisionCount: 2,
    riskCount: 1,
    keyPointCount: 5,
    contentType: "meeting",
    preview: "Leadership aligned on delivery priorities and assigned owners for the next execution window.",
    highlights: ["Timeline confirmed", "Ownership assigned", "One blocker flagged"],
    visualMetrics: [],
  },
  {
    id: "fallback-2",
    source: "Uploaded Media",
    title: "Client planning session action items",
    processing: false,
    dateValue: "2026-03-29T10:05:00.000Z",
    dateLabel: "29/03/2026",
    timeLabel: "10:05 AM",
    score: 84,
    tag: "Action Items",
    owner: "MeetingMind AI",
    icon: ListChecks,
    color: "text-blue-500",
    participantCount: 2,
    actionCount: 5,
    decisionCount: 1,
    riskCount: 0,
    keyPointCount: 4,
    contentType: "meeting",
    preview: "The client review focused on delivery sequencing, owner accountability, and pending materials.",
    highlights: ["Five follow-ups assigned", "Approval path clarified", "Delivery phases reviewed"],
    visualMetrics: [],
  },
  {
    id: "fallback-3",
    source: "MeetingMind Sync",
    title: "Internal review meeting report",
    processing: false,
    dateValue: "2026-03-28T16:15:00.000Z",
    dateLabel: "28/03/2026",
    timeLabel: "04:15 PM",
    score: 78,
    tag: "Decisions",
    owner: "MeetingMind AI",
    icon: FileText,
    color: "text-emerald-500",
    participantCount: 1,
    actionCount: 2,
    decisionCount: 3,
    riskCount: 1,
    keyPointCount: 3,
    contentType: "interview",
    preview: "The review captured the final recommendation set and highlighted one unresolved concern.",
    highlights: ["Three decisions recorded", "One concern remains open", "Two handoff actions set"],
    visualMetrics: [],
  },
];

function uniq(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function formatReportDate(value: string) {
  const parsed = parseISO(value);
  if (!isValid(parsed)) return "--/--/----";
  return format(parsed, "dd/MM/yyyy");
}

function formatReportTime(value: string) {
  const parsed = parseISO(value);
  if (!isValid(parsed)) return "--:--";
  return format(parsed, "hh:mm a");
}

function getMeetingSource(meeting: Meeting) {
  return meeting.transcript.some((entry) => entry.speaker === "Media Upload") ? "Uploaded Media" : "MeetingMind Sync";
}

function matchesDateRange(dateValue: string, range: DateRangeOption) {
  if (range === "all") return true;
  const parsed = parseISO(dateValue);
  if (!isValid(parsed)) return true;
  return parsed.getTime() >= subDays(new Date(), Number(range)).getTime();
}

function buildMeetingExportPayload(meeting: Meeting) {
  if (!meeting.summary) return null;
  return {
    title: meeting.title || meeting.summary.title || "Meeting report",
    reportText: buildPrintableSummaryReport(meeting.summary, {
      meetingDate: meeting.date,
      transcript: meeting.transcript,
      meetingTitle: meeting.title,
      duration: meeting.duration,
    }),
    visualSection: buildVisualizationSection(meeting.summary, meeting.transcript),
  };
}

function contentTypeLabel(value: ReportEntryContentType) {
  if (value === "meeting") return "Meeting";
  if (value === "lecture") return "Learning";
  if (value === "interview") return "Interview";
  return "General";
}

function priorityMeta(entry: ReportEntry) {
  if (entry.processing) return { label: "Processing", className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300" };
  if (entry.riskCount > 0) return { label: `${entry.riskCount} risk${entry.riskCount === 1 ? "" : "s"}`, className: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" };
  if (entry.actionCount >= 3) return { label: "Execution heavy", className: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300" };
  return { label: "Stable", className: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300" };
}

function scoreMeta(score: number) {
  if (score >= 88) return { pill: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300", bar: "from-emerald-400 to-cyan-500", label: "Excellent" };
  if (score >= 75) return { pill: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300", bar: "from-violet-400 to-indigo-500", label: "Strong" };
  return { pill: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300", bar: "from-sky-400 to-indigo-500", label: "Healthy" };
}

function ActionMenu({
  entry,
  className,
  onOpenMeeting,
  onOpenNotes,
  onDownloadSummary,
  onOpenEmailDialog,
  onCopyTitle,
}: {
  entry: ReportEntry;
  className?: string;
  onOpenMeeting: (entry: ReportEntry) => void;
  onOpenNotes: (entry: ReportEntry) => void;
  onDownloadSummary: (entry: ReportEntry, format: ReportExportFormat) => Promise<void>;
  onOpenEmailDialog: (entry: ReportEntry) => void;
  onCopyTitle: (entry: ReportEntry) => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className={cn("h-9 w-9 rounded-full border-border/70 bg-background/85 shadow-sm", className)}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5">
        <DropdownMenuItem onClick={() => onOpenMeeting(entry)} className="gap-2 rounded-xl">
          <FileText className="h-4 w-4" />
          Open meeting
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenNotes(entry)} className="gap-2 rounded-xl">
          <Brain className="h-4 w-4" />
          Open notes
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 rounded-xl">
            <Download className="h-4 w-4" />
            Export summary
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48 rounded-2xl p-1.5">
            <DropdownMenuItem onClick={() => void onDownloadSummary(entry, "pdf")} className="gap-2 rounded-xl">
              <Download className="h-4 w-4" />
              Download PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void onDownloadSummary(entry, "docx")} className="gap-2 rounded-xl">
              <FileText className="h-4 w-4" />
              Download DOCX
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onOpenEmailDialog(entry)} className="gap-2 rounded-xl">
              <Mail className="h-4 w-4" />
              Email summary
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void onCopyTitle(entry)} className="gap-2 rounded-xl">
          <Search className="h-4 w-4" />
          Copy title
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProCard({
  entry,
  onOpenMeeting,
  onOpenNotes,
  onDownloadSummary,
  onOpenEmailDialog,
  onCopyTitle,
}: {
  entry: ReportEntry;
  onOpenMeeting: (entry: ReportEntry) => void;
  onOpenNotes: (entry: ReportEntry) => void;
  onDownloadSummary: (entry: ReportEntry, format: ReportExportFormat) => Promise<void>;
  onOpenEmailDialog: (entry: ReportEntry) => void;
  onCopyTitle: (entry: ReportEntry) => Promise<void>;
}) {
  const priority = priorityMeta(entry);
  const score = scoreMeta(entry.score);

  return (
    <article className="relative overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(249,250,255,0.9)_100%)] p-5 shadow-[0_28px_72px_-42px_rgba(76,92,150,0.5)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.88)_0%,rgba(9,12,24,0.92)_100%)]">
      <div className="absolute -right-8 top-0 h-24 w-24 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/15" />
      <div className="relative flex h-full flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
              {entry.source}
            </Badge>
            <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", priority.className)}>
              {priority.label}
            </Badge>
          </div>
          <ActionMenu
            entry={entry}
            className="border-white/80 bg-white/85 dark:border-white/10 dark:bg-slate-900/80"
            onOpenMeeting={onOpenMeeting}
            onOpenNotes={onOpenNotes}
            onDownloadSummary={onDownloadSummary}
            onOpenEmailDialog={onOpenEmailDialog}
            onCopyTitle={onCopyTitle}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className={cn("mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/85 dark:bg-white/5", entry.color)}>
              <entry.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold leading-7 text-slate-900 dark:text-slate-100">{entry.title}</h3>
                {entry.processing && (
                  <Badge variant="secondary" className="border-none bg-violet-100 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                    Processing
                  </Badge>
                )}
              </div>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{entry.preview}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
              {contentTypeLabel(entry.contentType)}
            </Badge>
            <span>{entry.dateLabel}</span>
            <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            <span>{entry.timeLabel}</span>
            <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            <span>
              {entry.participantCount} participant{entry.participantCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className={cn("rounded-[22px] border px-4 py-3", score.pill)}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]">Insight</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold">{entry.score}</span>
              <span className="text-xs font-medium">{score.label}</span>
            </div>
          </div>
          <div className="rounded-[22px] border border-slate-200/80 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Actions</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{entry.actionCount}</p>
          </div>
          <div className="rounded-[22px] border border-slate-200/80 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Decisions</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{entry.decisionCount}</p>
          </div>
          <div className="rounded-[22px] border border-slate-200/80 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Risks</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{entry.riskCount}</p>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-white/72 p-4 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Session signal</p>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{entry.score}% readiness</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className={cn("h-full rounded-full bg-gradient-to-r", score.bar)} style={{ width: `${entry.score}%` }} />
          </div>
          {entry.visualMetrics.length > 0 && (
            <div className="mt-4 space-y-2">
              {entry.visualMetrics.slice(0, 3).map((metric) => (
                <div key={`${entry.id}-${metric.key}`}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-300">{metric.label}</span>
                    <span className="font-semibold text-slate-500 dark:text-slate-400">{metric.value}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-sky-500" style={{ width: `${metric.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {entry.highlights.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {entry.highlights.map((highlight) => (
              <span key={`${entry.id}-${highlight}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                {highlight}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-wrap gap-3">
          <Button onClick={() => onOpenMeeting(entry)} className="rounded-2xl bg-[linear-gradient(135deg,#8b5cf6_0%,#4f46e5_100%)] px-4 text-white">
            <ArrowRight className="h-4 w-4" />
            Open session
          </Button>
          <Button variant="outline" onClick={() => onOpenNotes(entry)} className="rounded-2xl border-slate-200 bg-white/85 px-4 dark:border-white/10 dark:bg-slate-900/75">
            <Brain className="h-4 w-4" />
            Notes
          </Button>
          <Button variant="outline" onClick={() => void onDownloadSummary(entry, "pdf")} className="rounded-2xl border-slate-200 bg-white/85 px-4 dark:border-white/10 dark:bg-slate-900/75">
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>
    </article>
  );
}

export function ReportsView() {
  const [, setSearchParams] = useSearchParams();
  const session = getAuthenticatedSession();
  const [proMode, setProMode] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeOption>("30");
  const [searchQuery, setSearchQuery] = useState("");
  const [notesEntry, setNotesEntry] = useState<ReportEntry | null>(null);
  const [notesMeeting, setNotesMeeting] = useState<Meeting | null>(null);
  const [emailMeeting, setEmailMeeting] = useState<Meeting | null>(null);
  const [emailRecipient, setEmailRecipient] = useState(session?.email ?? "");
  const [emailFormat, setEmailFormat] = useState<ReportExportFormat>("pdf");
  const [isSendingExportEmail, setIsSendingExportEmail] = useState(false);
  const { meetings, selectMeeting, activeWorkspace } = useMeetingStore();
  const { toast } = useToast();
  const storedNotes = loadMeetingNotes();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(PRO_MODE_STORAGE_KEY);
    if (stored) setProMode(stored === "true");
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(PRO_MODE_STORAGE_KEY, String(proMode));
  }, [proMode]);

  const resetView = () => {
    setSearchQuery("");
    setDateRange("30");
  };

  const handleRefreshDashboard = () => {
    setIsRefreshing(true);
    window.setTimeout(() => {
      setIsRefreshing(false);
      toast({
        title: "Dashboard refreshed",
        description: proMode ? "The Pro reports dashboard has been updated." : "The reports dashboard has been updated.",
      });
    }, 350);
  };

  const handleOpenMeeting = (entry: ReportEntry) => {
    if (!entry.meetingId) {
      toast({
        title: "No linked meeting",
        description: "This report preview is not connected to a stored meeting session yet.",
      });
      return;
    }
    selectMeeting(entry.meetingId);
    setSearchParams({ tab: "meeting" });
  };

  const getLinkedMeeting = (entry: ReportEntry) =>
    entry.meetingId ? meetings.find((meeting) => meeting.id === entry.meetingId) ?? null : null;

  const handleOpenNotes = (entry: ReportEntry) => {
    const linkedMeeting = getLinkedMeeting(entry);
    if (linkedMeeting) selectMeeting(linkedMeeting.id);
    setNotesMeeting(linkedMeeting);
    setNotesEntry(entry);
  };

  const handleCopyTitle = async (entry: ReportEntry) => {
    try {
      await navigator.clipboard.writeText(entry.title);
      toast({ title: "Title copied", description: `"${entry.title}" has been copied to your clipboard.` });
    } catch {
      toast({ title: "Copy failed", description: "The report title could not be copied right now.", variant: "destructive" });
    }
  };

  const handleDownloadSummary = async (entry: ReportEntry, format: ReportExportFormat) => {
    const linkedMeeting = getLinkedMeeting(entry);
    const payload = linkedMeeting ? buildMeetingExportPayload(linkedMeeting) : null;
    if (!payload) {
      toast({
        title: "No export available",
        description: "Only saved meeting summaries can be downloaded from this menu.",
        variant: "destructive",
      });
      return;
    }
    try {
      await exportReport({ ...payload, format });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "The summary export could not be generated.",
        variant: "destructive",
      });
    }
  };

  const handleOpenEmailDialog = (entry: ReportEntry) => {
    const linkedMeeting = getLinkedMeeting(entry);
    const payload = linkedMeeting ? buildMeetingExportPayload(linkedMeeting) : null;
    if (!linkedMeeting || !payload) {
      toast({
        title: "No export available",
        description: "Only saved meeting summaries can be emailed from this menu.",
        variant: "destructive",
      });
      return;
    }
    setEmailMeeting(linkedMeeting);
    setEmailFormat("pdf");
    setEmailRecipient((current) => current || session?.email || "");
  };

  const handleSendExportEmail = async () => {
    if (!emailMeeting) return;
    const payload = buildMeetingExportPayload(emailMeeting);
    const recipientEmail = normalizeEmail(emailRecipient);
    if (!payload) {
      toast({
        title: "No export available",
        description: "The selected summary could not be prepared for email.",
        variant: "destructive",
      });
      return;
    }
    if (!EMAIL_PATTERN.test(recipientEmail)) {
      toast({
        title: "Enter a valid email",
        description: "Please add a valid recipient address before sending the export.",
        variant: "destructive",
      });
      return;
    }
    setIsSendingExportEmail(true);
    try {
      const result = await sendExportEmail({ ...payload, format: emailFormat, toEmail: recipientEmail });
      toast({ title: "Export emailed", description: result.message || `${result.fileName} was sent to ${result.toEmail}.` });
      setEmailMeeting(null);
    } catch (error) {
      toast({
        title: "Could not send export",
        description: error instanceof Error ? error.message : "The export email could not be delivered.",
        variant: "destructive",
      });
    } finally {
      setIsSendingExportEmail(false);
    }
  };

  const totalActionItems = useMemo(
    () => meetings.reduce((count, meeting) => count + (meeting.summary?.actionItems?.length || 0), 0),
    [meetings],
  );
  const totalDecisions = useMemo(
    () => meetings.reduce((count, meeting) => count + (meeting.summary?.decisions?.length || 0), 0),
    [meetings],
  );
  const totalParticipants = useMemo(
    () => new Set(meetings.flatMap((meeting) => meeting.summary?.participants || [])).size,
    [meetings],
  );

  const entries = useMemo<ReportEntry[]>(() => {
    const mapped = [...meetings]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((meeting) => {
        const summary = meeting.summary;
        const actionCount = summary?.actionItems?.length || 0;
        const decisionCount = summary?.decisions?.length || 0;
        const participantCount = summary?.participants?.length || 0;
        const keyPointCount = summary?.keyPoints?.length || 0;
        const riskCount = (summary?.risks || []).filter((risk) => risk && !/no significant risks/i.test(risk)).length;

        let tag = "Summary";
        let icon: LucideIcon = FileText;
        let color = "text-violet-500";
        if (actionCount > 0) {
          tag = "Action Items";
          icon = ListChecks;
          color = "text-blue-500";
        } else if (decisionCount > 0) {
          tag = "Decisions";
          icon = Brain;
          color = "text-emerald-500";
        } else if (participantCount > 1) {
          tag = "Collaboration";
          icon = Video;
          color = "text-indigo-500";
        }

        return {
          id: meeting.id,
          meetingId: meeting.id,
          source: getMeetingSource(meeting),
          title: summary?.title || meeting.title || "Meeting report",
          processing: meeting.status !== "completed",
          dateValue: meeting.date,
          dateLabel: formatReportDate(meeting.date),
          timeLabel: formatReportTime(meeting.date),
          score: Math.min(99, 45 + participantCount * 6 + keyPointCount * 5 + actionCount * 4 + decisionCount * 3 + (proMode ? 6 : 0)),
          tag,
          owner: "MeetingMind AI",
          icon,
          color,
          participantCount,
          actionCount,
          decisionCount,
          riskCount,
          keyPointCount,
          contentType: summary?.contentType || (participantCount > 1 ? "meeting" : "general"),
          preview:
            summary?.executiveSummary ||
            summary?.keyPoints?.[0] ||
            summary?.conclusion ||
            (meeting.status === "completed" ? "Summary ready to review." : "MeetingMind is still assembling this report."),
          highlights: summary
            ? uniq([
                ...summary.keyPoints.slice(0, 1),
                ...summary.decisions.slice(0, 1),
                ...summary.actionItems.slice(0, 1).map((item) => item.task),
              ]).slice(0, 3)
            : [meeting.status === "completed" ? "Summary ready to review." : "Generating summary..."],
          visualMetrics: summary ? getSummaryVisualMetrics(summary, meeting.transcript) : [],
        };
      });

    return mapped.length ? mapped : fallbackEntries;
  }, [meetings, proMode]);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return entries
      .filter((entry) => {
        if (!matchesDateRange(entry.dateValue, dateRange)) return false;
        if (!query) return true;
        return [entry.title, entry.source, entry.tag, entry.owner, entry.preview, ...entry.highlights].some((value) =>
          value.toLowerCase().includes(query),
        );
      })
      .sort((a, b) => new Date(b.dateValue).getTime() - new Date(a.dateValue).getTime());
  }, [dateRange, entries, searchQuery]);

  const meetingNotes = notesMeeting ? getMeetingNotesForSession(storedNotes, notesMeeting) : [];
  const emailPayload = emailMeeting ? buildMeetingExportPayload(emailMeeting) : null;
  const leadEntry = filteredEntries[0] ?? null;
  const scope = filteredEntries.length ? filteredEntries : entries;
  const readyCount = scope.filter((entry) => !entry.processing).length;
  const avgScore = scope.length ? Math.round(scope.reduce((sum, entry) => sum + entry.score, 0) / scope.length) : 0;
  const riskReports = scope.filter((entry) => entry.riskCount > 0).length;
  const people = scope.reduce((sum, entry) => sum + entry.participantCount, 0);

  const statCards = [
    { label: "Average insight", value: `${avgScore}`, helper: "Across visible reports", icon: TrendingUp, tone: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
    { label: "Ready reports", value: `${readyCount}`, helper: "Finished and reviewable", icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
    { label: "Risk watch", value: `${riskReports}`, helper: "Reports with concerns", icon: ShieldAlert, tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
    { label: "Participant reach", value: `${people}`, helper: "Contributors represented", icon: Users, tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  ];

  return (
    <div className="w-full space-y-6 text-foreground">
      <section className={cn("relative overflow-hidden rounded-[30px] border p-5 sm:p-6", proMode ? "border-white/70 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),rgba(241,245,255,0.9)_38%,rgba(236,242,255,0.8)_100%)] shadow-[0_34px_96px_-50px_rgba(76,92,150,0.58)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,rgba(30,41,59,0.96),rgba(15,23,42,0.95)_42%,rgba(6,10,24,0.96)_100%)]" : "border-border/70 bg-card/70 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.55)] backdrop-blur-xl")}>
        {proMode && (
          <>
            <div className="absolute -left-10 top-0 h-44 w-44 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/12" />
            <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-sky-300/18 blur-3xl dark:bg-sky-500/10" />
          </>
        )}

        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={proMode ? "Search titles, insights, highlights, or sources" : "Search reports"}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className={cn("h-12 rounded-full pl-10 pr-24 text-sm", proMode ? "border-white/80 bg-white/85 shadow-[0_16px_40px_-30px_rgba(80,92,160,0.55)] dark:border-white/10 dark:bg-slate-950/70" : "border-border/70 bg-background/80 shadow-sm")}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Ctrl K</div>
            </div>

            <div className={cn("flex items-center justify-between gap-3 rounded-full px-4 py-2.5 lg:min-w-[180px]", proMode ? "border border-white/80 bg-white/82 shadow-[0_16px_40px_-30px_rgba(80,92,160,0.55)] dark:border-white/10 dark:bg-slate-950/72" : "border border-border/70 bg-background/75 shadow-sm")}>
              <div className="flex items-center gap-2">
                <Sparkles className={cn("h-4 w-4", proMode ? "text-violet-500" : "text-muted-foreground")} />
                <span className="text-sm font-medium text-muted-foreground">Pro Mode</span>
              </div>
              <Switch checked={proMode} onCheckedChange={setProMode} className="data-[state=checked]:bg-violet-500" />
            </div>
          </div>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              {proMode && <Badge variant="outline" className="rounded-full border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">Executive view</Badge>}
              <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">{proMode ? "Reports Command Center" : "Reports"}</h1>
              <p className="max-w-3xl text-sm font-medium text-muted-foreground sm:text-base">{proMode ? `Professional report intelligence for ${activeWorkspace.name}.` : "MeetingMind summaries, action items, and decision reports."}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className={cn("h-11 rounded-full px-5", proMode ? "border-white/80 bg-white/85 dark:border-white/10 dark:bg-slate-950/75" : "bg-background/80")}>
                    {dateRangeLabels[dateRange]}
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 rounded-2xl">
                  <DropdownMenuItem onClick={() => setDateRange("7")}>Last 7 days</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDateRange("30")}>Last 30 days</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDateRange("90")}>Last 90 days</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDateRange("all")}>All time</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="outline" className={cn("h-11 rounded-full px-5", proMode ? "border-white/80 bg-white/85 dark:border-white/10 dark:bg-slate-950/75" : "bg-background/80")} onClick={handleRefreshDashboard}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>

          {proMode && leadEntry && (
            <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
              <div className="relative overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(244,247,255,0.94)_100%)] p-5 shadow-[0_30px_80px_-48px_rgba(76,92,150,0.58)] dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.92)_0%,rgba(12,17,31,0.95)_100%)]">
                <div className="absolute -right-10 top-0 h-32 w-32 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/12" />
                <div className="relative flex h-full flex-col gap-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-full border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">Lead report</Badge>
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">{contentTypeLabel(leadEntry.contentType)}</Badge>
                    <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", priorityMeta(leadEntry).className)}>{priorityMeta(leadEntry).label}</Badge>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Workspace spotlight</p>
                    <h2 className="font-heading text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{leadEntry.title}</h2>
                    <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">{leadEntry.preview}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <span className="rounded-full border border-white/70 bg-white/85 px-3 py-1.5 dark:border-white/10 dark:bg-white/5">{leadEntry.dateLabel}</span>
                    <span className="rounded-full border border-white/70 bg-white/85 px-3 py-1.5 dark:border-white/10 dark:bg-white/5">{leadEntry.timeLabel}</span>
                    <span className={cn("rounded-full border px-3 py-1.5 font-semibold", scoreMeta(leadEntry.score).pill)}>Insight {leadEntry.score}</span>
                  </div>

                  {leadEntry.highlights.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {leadEntry.highlights.map((highlight) => (
                        <span key={`${leadEntry.id}-lead-${highlight}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                          {highlight}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto flex flex-wrap gap-3">
                    <Button onClick={() => handleOpenMeeting(leadEntry)} className="rounded-2xl bg-[linear-gradient(135deg,#8b5cf6_0%,#4f46e5_100%)] px-4 text-white">
                      <ArrowRight className="h-4 w-4" />
                      Open session
                    </Button>
                    <Button variant="outline" onClick={() => handleOpenNotes(leadEntry)} className="rounded-2xl border-white/80 bg-white/85 px-4 dark:border-white/10 dark:bg-slate-900/75">
                      <Brain className="h-4 w-4" />
                      Notes
                    </Button>
                    <Button variant="outline" onClick={() => void handleDownloadSummary(leadEntry, "pdf")} className="rounded-2xl border-white/80 bg-white/85 px-4 dark:border-white/10 dark:bg-slate-900/75">
                      <Download className="h-4 w-4" />
                      Export PDF
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                {statCards.map((card) => (
                  <div key={card.label} className="rounded-[24px] border border-white/70 bg-white/82 p-4 shadow-[0_24px_48px_-34px_rgba(76,92,150,0.45)] dark:border-white/10 dark:bg-slate-950/70">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{card.label}</p>
                        <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{card.value}</p>
                      </div>
                      <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", card.tone)}>
                        <card.icon className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{card.helper}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={cn("overflow-hidden rounded-[28px] border shadow-[0_28px_90px_-56px_rgba(15,23,42,0.65)]", proMode ? "border-white/70 bg-white/65 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/55" : "border-border/70 bg-card/80")}>
        {filteredEntries.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <FileText className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
            <h3 className="font-semibold text-lg">No reports match these filters</h3>
            <p className="mb-5 mt-2 text-sm text-muted-foreground">Try changing the date range or clearing the current search.</p>
            <Button variant="outline" onClick={resetView}>Reset view</Button>
          </div>
        ) : proMode ? (
          <div className="grid gap-4 p-4 md:p-5 xl:grid-cols-2">
            {filteredEntries.map((entry) => (
              <ProCard key={entry.id} entry={entry} onOpenMeeting={handleOpenMeeting} onOpenNotes={handleOpenNotes} onDownloadSummary={handleDownloadSummary} onOpenEmailDialog={handleOpenEmailDialog} onCopyTitle={handleCopyTitle} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full table-fixed text-sm">
              <thead className="border-b border-border/70 bg-muted/35">
                <tr>
                  <th className="w-[35%] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Session <ChevronDown className="inline h-3 w-3" /></th>
                  <th className="w-[12%] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Date</th>
                  <th className="w-[12%] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Time</th>
                  <th className="w-[13%] px-6 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Insight score</th>
                  <th className="w-[14%] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Focus</th>
                  <th className="w-[11%] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Generated by</th>
                  <th className="sticky right-0 z-10 w-[84px] bg-muted/35 px-4 py-4 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry.id} className="group border-b border-border/60 transition-colors hover:bg-muted/30">
                    <td className="px-6 py-5 align-top">
                      <div className="flex items-start gap-3">
                        <span className={cn("mt-1 shrink-0", entry.color)}><entry.icon className="h-5 w-5" /></span>
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="line-clamp-2 text-[15px] font-semibold leading-6 text-foreground">{entry.title}</p>
                            {entry.processing && <Badge variant="secondary" className="border-none bg-violet-100 py-0 text-[10px] font-normal text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">Processing</Badge>}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span>{entry.source}</span>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                            <span>{entry.participantCount} participant{entry.participantCount === 1 ? "" : "s"}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 align-top text-sm font-medium text-muted-foreground">{entry.dateLabel}</td>
                    <td className="px-6 py-5 align-top text-sm font-medium text-muted-foreground">{entry.timeLabel}</td>
                    <td className="px-6 py-5 align-top text-center"><div className="flex items-center justify-center gap-2"><div className={cn("h-2.5 w-2.5 rounded-full", entry.score > 80 ? "bg-violet-500" : entry.score > 60 ? "bg-indigo-500" : "bg-slate-400")} /><span className="text-base font-semibold text-foreground">{entry.score}</span></div></td>
                    <td className="px-6 py-5 align-top"><Badge variant="outline" className="rounded-full border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-medium text-violet-600 dark:border-violet-900/50 dark:bg-violet-950/30">{entry.tag}</Badge></td>
                    <td className="px-6 py-5 align-top text-sm font-medium text-muted-foreground">{entry.owner}</td>
                    <td className="sticky right-0 z-10 bg-card/80 px-4 py-5 align-top text-right group-hover:bg-muted/30"><ActionMenu entry={entry} onOpenMeeting={handleOpenMeeting} onOpenNotes={handleOpenNotes} onDownloadSummary={handleDownloadSummary} onOpenEmailDialog={handleOpenEmailDialog} onCopyTitle={handleCopyTitle} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={cn("flex flex-col gap-3 border-t px-4 py-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between", proMode ? "border-white/70 dark:border-white/10" : "border-border/70")}>
          <div>Showing {filteredEntries.length} of {entries.length} report entries from your MeetingMind workspace</div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1">{totalActionItems} tasks tracked</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">{totalDecisions} decisions captured</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">{totalParticipants} participants mapped</Badge>
          </div>
        </div>
      </section>

      <Dialog open={Boolean(notesEntry)} onOpenChange={(open) => { if (!open) { setNotesEntry(null); setNotesMeeting(null); } }}>
        <DialogContent className="max-w-2xl rounded-2xl border-border/60">
          <DialogHeader>
            <DialogTitle>Session Notes</DialogTitle>
            <DialogDescription>
              {notesMeeting && notesEntry
                ? `Notes for ${notesMeeting.summary?.title || notesMeeting.title} on ${format(parseISO(notesMeeting.date), "EEEE, MMMM do, yyyy 'at' h:mm a")}`
                : notesEntry
                  ? `Notes for ${notesEntry.title}`
                  : "Meeting notes"}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {meetingNotes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-5 py-10 text-center">
                <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
                <h4 className="text-base font-semibold">No notes have been taken</h4>
                <p className="mt-2 text-sm text-muted-foreground">This meeting session does not have any saved notes yet.</p>
              </div>
            ) : (
              meetingNotes.map((note) => (
                <div key={note.id} className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
                  <h4 className="text-base font-semibold">{note.title || "Untitled Note"}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(note.date).toLocaleString()}</p>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{note.content}</p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(emailMeeting)} onOpenChange={(open) => { if (!open) { setEmailMeeting(null); setEmailFormat("pdf"); } }}>
        <DialogContent className="max-w-md rounded-2xl border-border/60">
          <DialogHeader>
            <DialogTitle>Email Export</DialogTitle>
            <DialogDescription>Send the selected summary as a PDF or DOCX attachment.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="report-export-email">Recipient email</Label>
              <Input id="report-export-email" type="email" value={emailRecipient} onChange={(event) => setEmailRecipient(event.target.value)} placeholder="name@company.com" autoComplete="email" />
              <p className="text-xs text-muted-foreground">Your signed-in email is used as the default when it is available.</p>
            </div>

            <div className="grid gap-2">
              <Label>Format</Label>
              <Select value={emailFormat} onValueChange={(value) => setEmailFormat(value as ReportExportFormat)}>
                <SelectTrigger><SelectValue placeholder="Choose a format" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="docx">DOCX</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              The attachment will be generated from the current report for <span className="font-medium text-foreground">{emailPayload?.title || emailMeeting?.summary?.title || emailMeeting?.title || "this summary"}</span>.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailMeeting(null)} disabled={isSendingExportEmail}>Cancel</Button>
            <Button onClick={() => void handleSendExportEmail()} disabled={isSendingExportEmail || !emailPayload}>
              {isSendingExportEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {isSendingExportEmail ? "Sending..." : "Send export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
