import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  Sparkles,
  TimerReset,
  TrendingDown,
  TrendingUp,
  Users2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMeetingStore } from "@/hooks/useMeetingStore";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import type { Meeting } from "@/types/meeting";

const TOPIC_STOPWORDS = new Set([
  "about",
  "action",
  "agenda",
  "analysis",
  "audio",
  "call",
  "chunk",
  "client",
  "complete",
  "completed",
  "content",
  "decision",
  "discussion",
  "generated",
  "important",
  "items",
  "lecture",
  "meeting",
  "meetings",
  "notes",
  "overview",
  "participant",
  "point",
  "points",
  "recording",
  "report",
  "review",
  "session",
  "speaker",
  "speakers",
  "summary",
  "tasks",
  "team",
  "transcript",
  "uploaded",
  "video",
]);

const durationBucketPalette = ["#C7B7FF", "#A58BFF", "#8A6EFF", "#B79CFF"];
const panelClassName = "dashboard-panel rounded-[28px] p-5";
const subtlePanelClassName = "dashboard-panel-subtle rounded-[24px]";
const surfaceClassName = "dashboard-surface rounded-[24px] p-4";
const surfaceSoftClassName = "dashboard-surface-soft rounded-[22px]";
const sectionTitleClassName = "dashboard-title font-heading font-bold tracking-tight";
const sectionSubtitleClassName = "dashboard-muted mt-1 text-sm";
const strongTextClassName = "dashboard-strong";
const copyTextClassName = "dashboard-copy";
const mutedTextClassName = "dashboard-muted";
const faintTextClassName = "dashboard-faint";
const iconButtonClassName = "dashboard-icon-button";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function minutesFromDuration(duration?: string) {
  if (!duration) return 0;
  const [minutes = "0", seconds = "0"] = duration.split(":");
  const minuteValue = Number.parseInt(minutes, 10) || 0;
  const secondValue = Number.parseInt(seconds, 10) || 0;
  return minuteValue + secondValue / 60;
}

function extractMeetingTopicText(meeting: Meeting) {
  return [
    meeting.title,
    meeting.summary?.title,
    meeting.summary?.executiveSummary,
    ...(meeting.summary?.keyPoints || []),
    ...(meeting.summary?.decisions || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function toDisplayTopic(token: string) {
  return token
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildTopicRelevance(meetings: Meeting[]) {
  const counts = new Map<string, number>();

  meetings.forEach((meeting) => {
    const tokens = extractMeetingTopicText(meeting)
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(
        (token) =>
          token.length >= 4 &&
          !TOPIC_STOPWORDS.has(token) &&
          !/^\d+$/.test(token),
      );

    new Set(tokens).forEach((token) => {
      counts.set(token, (counts.get(token) || 0) + 1);
    });
  });

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([token, count]) => ({
      name: toDisplayTopic(token),
      count,
    }));
}

function formatHeroTime() {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(new Date());
}

function formatRelativeDate(dateValue: string) {
  const target = new Date(dateValue);
  if (Number.isNaN(target.getTime())) return "Recently";

  const now = new Date();
  const diffDays = Math.floor((now.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return target.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMiniDate(dateValue: string) {
  const target = new Date(dateValue);
  if (Number.isNaN(target.getTime())) return "Unknown";
  return target.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DashboardOverview({ onSelect }: { onSelect?: () => void }) {
  const [, setSearchParams] = useSearchParams();
  const { meetings, selectMeeting, activeWorkspace } = useMeetingStore();
  const { toast } = useToast();
  const [completedActionIds, setCompletedActionIds] = useState<string[]>([]);

  const completedMeetings = useMemo(
    () =>
      [...meetings]
        .filter((meeting) => meeting.status === "completed")
        .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()),
    [meetings],
  );

  const totalMeetings = meetings.length;
  const completionRate = totalMeetings > 0 ? Math.round((completedMeetings.length / totalMeetings) * 100) : 100;
  const durations = completedMeetings.map((meeting) => minutesFromDuration(meeting.duration)).filter((value) => value > 0);
  const averageDuration = durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 18;
  const totalActionItems = completedMeetings.reduce((count, meeting) => count + (meeting.summary?.actionItems?.length || 0), 0);
  const totalDecisions = completedMeetings.reduce((count, meeting) => count + (meeting.summary?.decisions?.length || 0), 0);
  const uniqueParticipants = new Set(
    completedMeetings.flatMap((meeting) => meeting.summary?.participants || []),
  ).size;

  const topics = useMemo(() => buildTopicRelevance(completedMeetings), [completedMeetings]);
  const topTopic = topics[0]?.name || "UI Design";
  const topTopicCount = topics[0]?.count || 0;

  const weeksSpan = useMemo(() => {
    if (completedMeetings.length < 2) return 1;
    const newest = new Date(completedMeetings[0].date).getTime();
    const oldest = new Date(completedMeetings[completedMeetings.length - 1].date).getTime();
    return Math.max(1, Math.ceil((newest - oldest) / (1000 * 60 * 60 * 24 * 7)));
  }, [completedMeetings]);

  const meetingsPerWeek = completedMeetings.length > 0 ? Math.max(1, Math.round(completedMeetings.length / weeksSpan)) : 4;
  const focusHourMeetings = completedMeetings.filter((meeting) => new Date(meeting.date).getHours() < 18).length;
  const focusHourRatio = completedMeetings.length > 0 ? focusHourMeetings / completedMeetings.length : 0.7;
  const actionDensity = completedMeetings.length > 0 ? totalActionItems / completedMeetings.length : 1.4;
  const productivityScore = clamp(
    Math.round(54 + completionRate * 0.18 + actionDensity * 10 + focusHourRatio * 14),
    58,
    96,
  );

  const pendingActions = completedMeetings.flatMap((meeting) =>
    (meeting.summary?.actionItems || []).map((item) => ({
      id: `${meeting.id}-${item.task}`,
      meetingId: meeting.id,
      label: item.task,
      subtitle: item.assignee || meeting.summary?.title || meeting.title,
    })),
  );
  const visiblePendingActions = pendingActions.filter((action) => !completedActionIds.includes(action.id));

  const actionItemsRecent = completedMeetings.slice(0, 3).reduce((count, meeting) => count + (meeting.summary?.actionItems?.length || 0), 0);
  const actionItemsPrevious = completedMeetings.slice(3, 6).reduce((count, meeting) => count + (meeting.summary?.actionItems?.length || 0), 0);
  const actionTrendDelta = actionItemsPrevious > 0
    ? Math.round(((actionItemsRecent - actionItemsPrevious) / actionItemsPrevious) * 100)
    : actionItemsRecent > 0
      ? 100
      : 0;

  const afterHoursCount = completedMeetings.filter((meeting) => new Date(meeting.date).getHours() >= 18).length;
  const smartInsights = [
    {
      icon: MessageSquareText,
      title: `Most discussed topic: ${topTopic}`,
      detail: topTopicCount > 0 ? `(${topTopicCount} session${topTopicCount === 1 ? "" : "s"})` : "Emerging theme",
      accent: "text-violet-600",
      targetView: "reports" as const,
    },
    {
      icon: actionTrendDelta <= 0 ? TrendingDown : TrendingUp,
      title:
        actionTrendDelta === 0
          ? "Action items are holding steady"
          : actionTrendDelta < 0
            ? `Action items are decreasing (${actionTrendDelta}%)`
            : `Action items are increasing (+${actionTrendDelta}%)`,
      detail: "Compared with your previous meetings",
      accent: actionTrendDelta < 0 ? "text-rose-500" : "text-emerald-500",
      targetView: "reports" as const,
    },
    {
      icon: TimerReset,
      title:
        afterHoursCount > 0
          ? "Meetings after 6PM tend to be less productive"
          : "Most sessions are landing inside your productive hours",
      detail: afterHoursCount > 0 ? `${afterHoursCount} late session${afterHoursCount === 1 ? "" : "s"} detected` : "Healthy timing distribution",
      accent: "text-indigo-500",
      targetView: "calendar" as const,
    },
  ];

  const trendData = useMemo(() => {
    if (completedMeetings.length === 0) {
      return [
        { label: "Apr 04", value: 12 },
        { label: "Apr 09", value: 15 },
        { label: "Apr 12", value: 16 },
        { label: "Apr 18", value: 14 },
        { label: "Apr 22", value: 21 },
        { label: "Apr 27", value: 18 },
      ];
    }

    return completedMeetings
      .slice(0, 6)
      .reverse()
      .map((meeting) => ({
        label: formatMiniDate(meeting.date),
        value:
          8 +
          (meeting.summary?.participants?.length || 1) * 2 +
          (meeting.summary?.actionItems?.length || 0) * 2 +
          (meeting.summary?.decisions?.length || 0) +
          Math.round(minutesFromDuration(meeting.duration) / 6),
      }));
  }, [completedMeetings]);

  const durationBuckets = useMemo(() => {
    const buckets = [
      { name: "0-15", value: 0 },
      { name: "15-30", value: 0 },
      { name: "30-45", value: 0 },
      { name: "45+", value: 0 },
    ];

    if (durations.length === 0) {
      return [
        { name: "0-15", value: 4 },
        { name: "15-30", value: 5 },
        { name: "30-45", value: 3 },
        { name: "45+", value: 4 },
      ];
    }

    durations.forEach((value) => {
      if (value < 15) buckets[0].value += 1;
      else if (value < 30) buckets[1].value += 1;
      else if (value < 45) buckets[2].value += 1;
      else buckets[3].value += 1;
    });

    return buckets;
  }, [durations]);

  const recentMeetings = completedMeetings.slice(0, 3);
  const spotlightMeeting = recentMeetings[0] || null;
  const heroInsight =
    averageDuration <= 20 && totalActionItems < Math.max(2, completedMeetings.length)
      ? "Your meetings are shorter but still need stronger follow-through on next steps."
      : completionRate >= 80
        ? "Your workspace is capturing summaries consistently and the team is closing sessions cleanly."
        : "A few meetings are still open, so there is room to improve processing consistency.";

  const openMeeting = (meetingId: string) => {
    selectMeeting(meetingId);
    if (onSelect) onSelect();
  };

  const openReports = () => {
    setSearchParams({ tab: "reports" });
  };

  const openCalendar = () => {
    setSearchParams({ tab: "calendar" });
  };

  const openExports = () => {
    setSearchParams({ tab: "exports" });
  };

  const handlePendingActionClick = (meetingId?: string) => {
    if (meetingId) {
      openMeeting(meetingId);
      return;
    }

    openReports();
  };

  const handleActionCenterPrimary = () => {
    const firstPendingAction = visiblePendingActions[0];

    if (!firstPendingAction) {
      openReports();
      return;
    }

    setCompletedActionIds((current) => [...current, firstPendingAction.id]);
    toast({
      title: "Action marked complete",
      description: `"${firstPendingAction.label}" has been cleared from the dashboard queue.`,
    });
  };

  const handleSpotlightExport = () => {
    if (spotlightMeeting) {
      selectMeeting(spotlightMeeting.id);
    }
    openExports();
  };

  return (
    <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-6 pb-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2.25fr)_320px]">
        <section className="rounded-[32px] border border-white/75 bg-[linear-gradient(135deg,#6f59eb_0%,#876eff_36%,#c685ef_70%,#f0b0d7_100%)] p-5 text-white shadow-[0_36px_90px_-48px_rgba(101,77,214,0.95)] dark:border-white/10 dark:bg-[linear-gradient(135deg,#312e81_0%,#4338ca_34%,#6d28d9_68%,#be185d_100%)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-heading text-[2rem] font-bold leading-tight tracking-tight">
                AI Meeting Overview <span className="text-white/80">(Today)</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/80">
                Workspace analytics for {activeWorkspace.name}, showing meeting pace, follow-through, and top themes across recent sessions.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-full border border-white/20 bg-white/12 px-4 py-2 text-sm text-white/90 backdrop-blur-xl dark:bg-black/15">
              <Clock3 className="h-4 w-4" />
              {formatHeroTime()}
            </div>
          </div>

          <div className="dashboard-surface mt-5 rounded-[28px] p-4 text-slate-800 dark:text-slate-100">
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <p className={`${mutedTextClassName} text-sm`}>Meetings</p>
                <p className={`mt-1 text-3xl font-bold ${strongTextClassName}`}>{totalMeetings || 3}</p>
              </div>
              <div>
                <p className={`${mutedTextClassName} text-sm`}>Productivity</p>
                <p className={`mt-1 text-3xl font-bold ${strongTextClassName}`}>{productivityScore}%</p>
              </div>
              <div>
                <p className={`${mutedTextClassName} text-sm`}>Top Topic</p>
                <p className={`mt-1 text-3xl font-bold ${strongTextClassName}`}>{topTopic}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <div className="dashboard-soft-chip rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Total Meetings
                </div>
                <p className={`mt-1 text-lg font-bold ${strongTextClassName}`}>{completedMeetings.length || totalMeetings || 3}</p>
              </div>
              <div className="dashboard-soft-chip rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
                  <Users2 className="h-4 w-4" />
                  Avg. pace
                </div>
                <p className={`mt-1 text-lg font-bold ${strongTextClassName}`}>{meetingsPerWeek} per week</p>
              </div>
              <div className="dashboard-soft-chip rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
                  <Clock3 className="h-4 w-4" />
                  Avg Duration
                </div>
                <p className={`mt-1 text-lg font-bold ${strongTextClassName}`}>{averageDuration} min</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={openReports}
            className="mt-4 flex w-full items-center justify-between rounded-[24px] border border-white/25 bg-white/18 px-5 py-4 text-left shadow-[0_24px_60px_-48px_rgba(54,32,138,0.9)] backdrop-blur-xl transition hover:bg-white/24 dark:bg-black/10 dark:hover:bg-black/20"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
                <Lightbulb className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium">
                <span className="font-semibold">Insight:</span> {heroInsight}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-white/80" />
          </button>
        </section>

        <aside className={`${panelClassName} flex flex-col gap-4`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`${sectionTitleClassName} text-[1.65rem]`}>Action Center</h2>
              <p className={sectionSubtitleClassName}>Team follow-ups that need attention.</p>
            </div>
            <button type="button" onClick={openReports} className={iconButtonClassName}>
              <ArrowUpRight className="h-5 w-5" />
            </button>
          </div>

          <div className={surfaceClassName}>
            <div className={`flex items-center gap-3 border-b border-slate-100 pb-4 dark:border-white/10 ${copyTextClassName}`}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <span className="text-base font-semibold">
                Pending Actions: {visiblePendingActions.length}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {visiblePendingActions.length > 0 ? (
                visiblePendingActions.slice(0, 3).map((action) => (
                  <button
                  key={action.id}
                  type="button"
                  onClick={() => handlePendingActionClick(action.meetingId)}
                  className="dashboard-soft-block flex w-full items-start gap-3 rounded-2xl border border-slate-100 px-3 py-3 text-left transition hover:border-violet-200 hover:bg-violet-50/40 dark:border-white/10 dark:hover:bg-violet-500/10"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-violet-200 bg-violet-50 text-violet-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                      <span className={`block truncate text-sm font-semibold ${strongTextClassName}`}>{action.label}</span>
                      <span className={`mt-1 block text-xs ${mutedTextClassName}`}>{action.subtitle}</span>
                  </span>
                </button>
              ))
            ) : (
                <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 px-4 py-5 text-center dark:border-violet-500/30 dark:bg-violet-500/10">
                  <p className={`text-sm font-semibold ${strongTextClassName}`}>
                    {pendingActions.length > 0 ? "Everything is marked complete" : "No pending actions yet"}
                  </p>
                  <p className={`mt-1 text-xs ${mutedTextClassName}`}>
                    {pendingActions.length > 0
                      ? "Open your reports to review the finished follow-ups."
                      : "Complete a meeting to surface next steps and owners here."}
                  </p>
                </div>
              )}
            </div>

            <Button
              onClick={handleActionCenterPrimary}
              className="mt-5 w-full rounded-2xl bg-[linear-gradient(135deg,#9b7bff_0%,#7d5cff_100%)] text-white shadow-[0_18px_36px_-22px_rgba(125,92,255,0.95)] hover:opacity-95"
            >
              {visiblePendingActions.length > 0 ? "Mark Complete" : "Open reports"}
            </Button>
          </div>
        </aside>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,1.2fr)_300px]">
        <section className={panelClassName}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`${sectionTitleClassName} text-2xl`}>Smart Insights</h3>
              <p className={sectionSubtitleClassName}>Quick signals extracted from your recent meetings.</p>
            </div>
            <button type="button" onClick={openReports} className={iconButtonClassName}>
              <ArrowUpRight className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {smartInsights.map((insight) => (
              <button
                key={insight.title}
                type="button"
                onClick={() => setSearchParams({ tab: insight.targetView })}
                className="dashboard-surface-soft flex w-full items-start gap-3 px-4 py-4 text-left transition hover:translate-x-0.5 hover:border-violet-200 dark:hover:bg-violet-500/10"
              >
                <span className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-50 ${insight.accent}`}>
                  <insight.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${strongTextClassName}`}>{insight.title}</p>
                  <p className={`mt-1 text-xs ${mutedTextClassName}`}>{insight.detail}</p>
                </div>
                <ChevronRight className={`ml-auto h-4 w-4 shrink-0 ${faintTextClassName}`} />
              </button>
            ))}
          </div>

          <div className="dashboard-soft-pill mt-6 rounded-[20px] px-4 py-4">
            <div className={`flex items-center justify-between text-sm ${copyTextClassName}`}>
              <span>Duration vs Productivity</span>
              <span className="font-semibold text-violet-600">{productivityScore}%</span>
            </div>
            <Progress value={productivityScore} className="mt-3 h-2.5 bg-violet-100 [&>div]:bg-[linear-gradient(90deg,#9b7bff_0%,#7d5cff_100%)]" />
          </div>
        </section>

        <section className={panelClassName}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`${sectionTitleClassName} text-2xl`}>Meetings Insights</h3>
              <p className={sectionSubtitleClassName}>Activity momentum across your latest completed sessions.</p>
            </div>
            <button type="button" onClick={openCalendar} className={iconButtonClassName}>
              <ArrowUpRight className="h-5 w-5" />
            </button>
          </div>

          <div className="dashboard-surface-soft mt-5 rounded-[24px] p-4 dark:bg-slate-950/60">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-violet-600">
                <TrendingUp className="h-4 w-4" />
                Meetings Over Time
              </div>
              <div className={`text-xs ${mutedTextClassName}`}>
                Today: <span className={`font-semibold ${copyTextClassName}`}>{completedMeetings.length || 14} sessions</span>
              </div>
            </div>

            <div className="h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(152,137,255,0.16)" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#8b86a8", fontSize: 12 }} />
                  <YAxis hide domain={["dataMin - 2", "dataMax + 2"]} />
                  <Tooltip
                    cursor={{ stroke: "rgba(125,92,255,0.22)", strokeWidth: 1 }}
                    contentStyle={{
                      borderRadius: "18px",
                      border: "1px solid rgba(255,255,255,0.9)",
                      boxShadow: "0 20px 48px -32px rgba(101,77,214,0.45)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#8b6dff"
                    strokeWidth={3}
                    dot={{ r: 3.5, strokeWidth: 0, fill: "#8b6dff" }}
                    activeDot={{ r: 6, fill: "#8b6dff" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-violet-700">
              <TimerReset className="h-4 w-4" />
              Every {meetingsPerWeek} per week
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div className={panelClassName}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`${sectionTitleClassName} text-[1.8rem]`}>Meeting Summary</h3>
                <p className={sectionSubtitleClassName}>Duration distribution of your saved sessions.</p>
              </div>
              <button type="button" onClick={openReports} className={iconButtonClassName}>
                <ArrowUpRight className="h-5 w-5" />
              </button>
            </div>

            <div className="dashboard-surface-soft mt-5 h-[170px] w-full px-3 py-2 dark:bg-slate-950/60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={durationBuckets} margin={{ left: 6, right: 6, top: 10, bottom: 4 }} barCategoryGap="26%">
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tickMargin={10}
                    padding={{ left: 10, right: 10 }}
                    tick={{ fill: "#7c7696", fontSize: 12 }}
                  />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: "rgba(125,92,255,0.08)" }}
                    contentStyle={{
                      borderRadius: "16px",
                      border: "1px solid rgba(255,255,255,0.92)",
                      boxShadow: "0 18px 40px -28px rgba(101,77,214,0.45)",
                    }}
                  />
                  <Bar dataKey="value" radius={[10, 10, 10, 10]} maxBarSize={26}>
                    {durationBuckets.map((entry, index) => (
                      <Cell key={entry.name} fill={durationBucketPalette[index % durationBucketPalette.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className={`mt-4 text-center text-xs font-semibold uppercase tracking-[0.18em] ${faintTextClassName}`}>
              Duration distribution
            </p>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(135deg,#8a6eff_0%,#7b5dff_38%,#7151ee_100%)] text-white shadow-[0_34px_90px_-44px_rgba(101,77,214,0.95)]">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white/80">Processing Completion Rate</p>
                  <h3 className="mt-3 text-5xl font-bold tracking-tight">{completionRate}%</h3>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/14">
                  <Sparkles className="h-4 w-4" />
                </span>
              </div>

              <p className="mt-3 text-sm text-white/75">
                {completionRate >= 100 ? "Completed" : "Still processing"} across meeting capture, summaries, and report generation.
              </p>

              <Progress value={completionRate} className="mt-6 h-2 bg-white/20 [&>div]:bg-white" />
            </div>

            <button
              type="button"
              onClick={openReports}
              className="flex w-full items-center justify-between border-t border-white/15 bg-white/10 px-5 py-4 text-left text-sm text-white/90 transition hover:bg-white/16"
            >
              View All
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_320px]">
        <section className={panelClassName}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`${sectionTitleClassName} text-[1.9rem]`}>My Recent Meetings</h3>
              <p className={sectionSubtitleClassName}>Recent summaries, participants, and action coverage.</p>
            </div>
            <button type="button" onClick={openReports} className={iconButtonClassName}>
              <ArrowUpRight className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,1fr)]">
            <div className="dashboard-surface-soft rounded-[24px] px-4 py-3 dark:bg-slate-950/60">
              {(recentMeetings.length > 0 ? recentMeetings : completedMeetings.slice(0, 1)).length > 0 ? (
                (recentMeetings.length > 0 ? recentMeetings : completedMeetings.slice(0, 1)).map((meeting, index) => (
                  <button
                    key={meeting.id}
                    type="button"
                    onClick={() => openMeeting(meeting.id)}
                    className={`flex w-full items-center justify-between gap-4 py-4 text-left transition hover:translate-x-0.5 ${
                      index !== 0 ? "border-t border-slate-100 dark:border-white/10" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`truncate text-lg font-semibold ${sectionTitleClassName}`}>
                        {meeting.summary?.title || meeting.title}
                      </p>
                      <div className={`mt-2 flex flex-wrap items-center gap-3 text-xs ${mutedTextClassName}`}>
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-violet-600">
                          <Users2 className="h-3.5 w-3.5" />
                          {meeting.summary?.participants?.length || 0} participants
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-600">
                          <ListChecks className="h-3.5 w-3.5" />
                          {meeting.summary?.actionItems?.length || 0} tasks
                        </span>
                        <span>{formatRelativeDate(meeting.date)}</span>
                      </div>
                    </div>
                    <ArrowRight className={`h-4 w-4 shrink-0 ${faintTextClassName}`} />
                  </button>
                ))
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[22px] border border-dashed border-violet-200 bg-violet-50/60 px-6 text-center dark:border-violet-500/30 dark:bg-violet-500/10">
                  <Users2 className="h-9 w-9 text-violet-300" />
                  <p className={`mt-4 text-lg font-semibold ${strongTextClassName}`}>No meetings yet</p>
                  <p className={`mt-2 max-w-sm text-sm ${mutedTextClassName}`}>
                    Start a new meeting or upload audio to populate this dashboard with live summaries and team insights.
                  </p>
                  <Button onClick={() => setSearchParams({ tab: "meeting" })} className="mt-5 rounded-2xl bg-[linear-gradient(135deg,#9b7bff_0%,#7d5cff_100%)] text-white">
                    Start your first meeting
                  </Button>
                </div>
              )}
            </div>

            <div className={`${subtlePanelClassName} p-5`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Spotlight Meeting</p>
                  <h4 className={`mt-2 truncate font-heading text-2xl font-bold tracking-tight ${sectionTitleClassName}`}>
                    {spotlightMeeting?.summary?.title || spotlightMeeting?.title || "OK, my name is KRTHI, not Kirti"}
                  </h4>
                </div>
                <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                  {spotlightMeeting ? formatRelativeDate(spotlightMeeting.date) : "Yesterday"}
                </span>
              </div>

              <div className={`mt-5 space-y-3 text-sm ${copyTextClassName}`}>
                <div className="dashboard-soft-block flex items-center justify-between rounded-2xl px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <Users2 className="h-4 w-4 text-violet-500" />
                    Participants
                  </span>
                  <span className={`font-semibold ${strongTextClassName}`}>
                    {spotlightMeeting?.summary?.participants?.length || uniqueParticipants || 3}
                  </span>
                </div>
                <div className="dashboard-soft-block flex items-center justify-between rounded-2xl px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4 text-violet-500" />
                    Key Decision
                  </span>
                  <span className={`truncate pl-3 text-right font-medium ${strongTextClassName}`}>
                    {spotlightMeeting?.summary?.decisions?.[0] || "Clearer alignment on the next design iteration"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSpotlightExport}
                  className="dashboard-soft-block flex w-full items-center justify-between rounded-2xl px-4 py-3 transition hover:bg-violet-50/60 dark:hover:bg-violet-500/10"
                >
                  <span className="inline-flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-violet-500" />
                    Send report to client
                  </span>
                  <ChevronRight className={`h-4 w-4 ${faintTextClassName}`} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={`${panelClassName} flex flex-col justify-between`}>
          <div>
            <h3 className={`${sectionTitleClassName} text-[1.7rem]`}>Workspace Snapshot</h3>
            <p className={sectionSubtitleClassName}>The essentials at a glance for your team.</p>
          </div>

          <div className="mt-5 grid gap-3">
            <div className="dashboard-soft-pill rounded-[22px] px-4 py-4">
              <p className={`text-sm ${mutedTextClassName}`}>Total participants</p>
              <p className={`mt-1 text-3xl font-bold ${sectionTitleClassName}`}>{uniqueParticipants || 6}</p>
            </div>
            <div className="rounded-[22px] bg-indigo-50/70 px-4 py-4 dark:bg-indigo-500/10">
              <p className={`text-sm ${mutedTextClassName}`}>Decisions captured</p>
              <p className={`mt-1 text-3xl font-bold ${sectionTitleClassName}`}>{totalDecisions || 4}</p>
            </div>
            <div className="rounded-[22px] bg-rose-50/70 px-4 py-4 dark:bg-rose-500/10">
              <p className={`text-sm ${mutedTextClassName}`}>Action items</p>
              <p className={`mt-1 text-3xl font-bold ${sectionTitleClassName}`}>{totalActionItems || 3}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={openReports}
            className="dashboard-surface-soft mt-5 flex items-center justify-between rounded-[22px] px-4 py-3 text-sm font-medium transition hover:bg-white dark:hover:bg-slate-900"
          >
            View analytics details
            <ChevronRight className={`h-4 w-4 ${faintTextClassName}`} />
          </button>
        </section>
      </div>
    </div>
  );
}
