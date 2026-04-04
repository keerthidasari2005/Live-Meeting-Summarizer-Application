import { format, isValid, parseISO } from "date-fns";
import type { MeetingSummary, TranscriptEntry, MeetingContentType } from "@/types/meeting";

const DEFAULT_RISK = "No significant risks or concerns were identified.";
const DEFAULT_INSIGHT = "The session content was captured at a high level, but no detailed discussion insights were reliably extracted.";
const NO_DECISIONS = "No formal decisions were made.";
const NO_ACTIONS = "No action items were identified.";
const NO_EXAMPLES = "No specific examples or demonstrations were clearly identified.";
const NO_RESPONSES = "No notable responses were clearly identified from the conversation.";
const REPORT_HEADER = "MeetingMind AI Summary Report";
const REPORT_CLASSIFICATION = "Confidential";
const REPORT_FIELD_HINT = "Field: Value format";
const REPORT_SEPARATOR = "-----------------------------------------";

export type PrintableReportOptions = {
  meetingDate?: string;
  transcript?: TranscriptEntry[] | string;
  meetingTitle?: string;
  duration?: string;
  generatedAt?: string;
};

export type SummaryVisualMetric = {
  key: "advantages" | "actions" | "decisions" | "risks" | "participants" | "discussion";
  label: string;
  value: number;
  percent: number;
  description: string;
};

function cleanText(value: string | undefined | null) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function uniqueItems(items: string[]) {
  return Array.from(new Set(items.map(cleanText).filter(Boolean)));
}

function formatReportDate(value?: string) {
  if (!value) return format(new Date(), "MMMM d, yyyy");

  const parsedIso = parseISO(value);
  if (isValid(parsedIso)) {
    return format(parsedIso, "MMMM d, yyyy");
  }

  const parsedDate = new Date(value);
  if (!Number.isNaN(parsedDate.getTime())) {
    return format(parsedDate, "MMMM d, yyyy");
  }

  return value;
}

function formatReportTimestamp(value?: string) {
  if (!value) return format(new Date(), "MMMM d, yyyy, h:mm a");

  const parsedIso = parseISO(value);
  if (isValid(parsedIso)) {
    return format(parsedIso, "MMMM d, yyyy, h:mm a");
  }

  const parsedDate = new Date(value);
  if (!Number.isNaN(parsedDate.getTime())) {
    return format(parsedDate, "MMMM d, yyyy, h:mm a");
  }

  return value;
}

function formatBulletSection(items: string[], fallback: string) {
  const cleaned = uniqueItems(items);
  return cleaned.length > 0 ? cleaned.map((item) => `- ${item}`).join("\n") : fallback;
}

function getTranscriptText(transcript?: TranscriptEntry[] | string) {
  if (Array.isArray(transcript)) {
    return transcript.map((entry) => cleanText(entry.text)).filter(Boolean).join(" ");
  }

  return cleanText(transcript);
}

function getTranscriptEntries(transcript?: TranscriptEntry[] | string) {
  return Array.isArray(transcript) ? transcript : [];
}

function splitSentences(text: string) {
  return text
    .split(/[.!?]+/)
    .filter(Boolean)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 8);
}

function getDisplayContentType(contentType: MeetingContentType) {
  if (contentType === "lecture") return "Lecture / Educational Video";
  if (contentType === "interview") return "Interview / Conversation";
  return "Meeting";
}

function resolveContentType(summary: MeetingSummary, transcript?: TranscriptEntry[] | string): MeetingContentType {
  if (summary.contentType) return summary.contentType;

  if (summary.participants.length > 1 && (summary.decisions.length > 0 || summary.actionItems.length > 0)) {
    return "meeting";
  }

  if (summary.participants.length > 1) {
    return "interview";
  }

  const text = getTranscriptText(transcript).toLowerCase();
  const learningSignals =
    text.match(/\b(lecture|tutorial|lesson|concept|theory|definition|example|chapter|explain|learning|students?|class|course|presentation|speech)\b/gi)?.length || 0;

  return learningSignals > 0 ? "lecture" : "lecture";
}

function getMeaningfulKeyPoints(summary: MeetingSummary) {
  return uniqueItems(summary.keyPoints).filter((item) => item !== DEFAULT_INSIGHT);
}

function getMeaningfulDecisions(summary: MeetingSummary) {
  return uniqueItems(summary.decisions).filter((item) => item !== NO_DECISIONS);
}

function getMeaningfulRisks(summary: MeetingSummary) {
  return uniqueItems(summary.risks || []).filter((item) => item !== DEFAULT_RISK);
}

function getFormattedActionItems(summary: MeetingSummary) {
  return summary.actionItems
    .map((item) => {
      const task = cleanText(item.task);
      const assignee = cleanText(item.assignee);
      const deadline = cleanText(item.deadline);

      if (!task) return "";
      return `${task} - ${assignee || "To be assigned"} - ${deadline || "Deadline not specified"}`;
    })
    .filter(Boolean);
}

function formatEnterpriseBulletSection(items: string[], fallback: string) {
  const cleaned = uniqueItems(items);
  const values = cleaned.length > 0 ? cleaned : [fallback];
  return values.map((item) => `• ${item}`).join("\n");
}

function normalizeDuration(value?: string) {
  const cleaned = cleanText(value);
  if (!cleaned || cleaned === "0:00") {
    return "Not specified";
  }
  return cleaned;
}

function deriveHighlights(summary: MeetingSummary, contentType: MeetingContentType) {
  const points = getMeaningfulKeyPoints(summary).slice(0, 4);

  if (contentType === "meeting") {
    return uniqueItems([
      ...points,
      ...getMeaningfulDecisions(summary).slice(0, 2),
      ...summary.actionItems.slice(0, 2).map((item) => cleanText(item.task)),
    ]).slice(0, 5);
  }

  return points;
}

function deriveAdvantages(summary: MeetingSummary, contentType: MeetingContentType) {
  return uniqueItems([
    ...deriveHighlights(summary, contentType).slice(0, 2),
    ...(contentType === "meeting" && getMeaningfulDecisions(summary).length > 0
      ? ["Clear decisions were captured for follow-through."]
      : []),
    ...(contentType === "meeting" && getFormattedActionItems(summary).length > 0
      ? ["Defined action ownership was established during the session."]
      : []),
    ...(contentType === "interview" && summary.participants.length > 1
      ? ["Multiple viewpoints were represented in the conversation."]
      : []),
    ...(contentType === "lecture" ? ["The session delivered structured explanatory content."] : []),
  ]).slice(0, 4);
}

function deriveMetrics(summary: MeetingSummary, contentType: MeetingContentType) {
  const keyPointCount = getMeaningfulKeyPoints(summary).length || summary.keyPoints.length;
  const decisionCount = getMeaningfulDecisions(summary).length;
  const actionCount = getFormattedActionItems(summary).length;

  if (contentType === "lecture") {
    return keyPointCount > 0 ? [`${keyPointCount} key concept(s) or learning point(s) were identified in the session.`] : [];
  }

  if (contentType === "interview") {
    return [
      summary.participants.length > 0 ? `${summary.participants.length} participant(s) were identified in the conversation.` : "",
      keyPointCount > 0 ? `${keyPointCount} main topic(s) were discussed during the exchange.` : "",
    ].filter(Boolean);
  }

  return [
    summary.participants.length > 0 ? `${summary.participants.length} participant(s) were identified in the meeting record.` : "",
    keyPointCount > 0 ? `${keyPointCount} key discussion point(s) were captured.` : "",
    decisionCount > 0 ? `${decisionCount} formal decision(s) were documented.` : "",
    actionCount > 0 ? `${actionCount} action item(s) were assigned for follow-up.` : "",
  ].filter(Boolean);
}

function deriveTrends(contentType: MeetingContentType, transcriptText: string, summary: MeetingSummary) {
  const trends: string[] = [];
  const wordCount = transcriptText.split(/\s+/).filter(Boolean).length;

  if (contentType === "lecture") {
    if ((getMeaningfulKeyPoints(summary).length || summary.keyPoints.length) > 2) {
      trends.push("The content progressed through multiple related concepts in a structured explanatory sequence.");
    }
    if (wordCount > 250) {
      trends.push("The session provided extended explanatory detail, indicating a comprehensive instructional flow.");
    }
    return trends;
  }

  if (contentType === "interview") {
    if (wordCount > 250) {
      trends.push("The conversation included extended informational exchange across multiple turns.");
    }
    return trends;
  }

  if (getFormattedActionItems(summary).length >= getMeaningfulDecisions(summary).length && getFormattedActionItems(summary).length > 0) {
    trends.push("The discussion placed stronger emphasis on execution and follow-up than on formal approvals.");
  }
  if ((getMeaningfulKeyPoints(summary).length || summary.keyPoints.length) > 3) {
    trends.push("The meeting covered multiple related topics, indicating a broad working agenda.");
  }
  if (wordCount > 250) {
    trends.push("The transcript indicates an extended discussion with detailed context and elaboration.");
  }

  return trends;
}

function deriveComparisons(contentType: MeetingContentType, transcriptText: string) {
  const hasComparison = /\b(compare|comparison|versus|vs\.?|difference|rather than|more than|less than)\b/i.test(
    transcriptText,
  );

  if (!hasComparison) return [];

  if (contentType === "lecture") {
    return ["The session included comparative explanation between concepts or approaches."];
  }

  if (contentType === "interview") {
    return ["The conversation included comparative viewpoints or contrasting responses."];
  }

  return ["The meeting included comparative evaluation between options, approaches, or priorities."];
}

function deriveExamples(transcriptText: string) {
  return uniqueItems(
    splitSentences(transcriptText)
      .filter((sentence) => /\b(example|for example|for instance|demonstrat|illustrat|such as|case study)\b/i.test(sentence))
      .slice(0, 4),
  );
}

function derivePracticalApplications(summary: MeetingSummary, transcriptText: string) {
  const applications = uniqueItems(
    [
      ...splitSentences(transcriptText)
        .filter((sentence) => /\b(apply|application|practical|use|real[- ]world|implement|practice)\b/i.test(sentence))
        .slice(0, 4),
      ...summary.nextSteps.slice(0, 2),
    ].map(cleanText),
  );

  return applications;
}

function buildAiInsights(summary: MeetingSummary, contentType: MeetingContentType, transcript?: TranscriptEntry[] | string) {
  const transcriptText = getTranscriptText(transcript);
  const keyPointCount = getMeaningfulKeyPoints(summary).length || summary.keyPoints.length;
  const decisionCount = getMeaningfulDecisions(summary).length;
  const actionCount = getFormattedActionItems(summary).length;
  const riskCount = getMeaningfulRisks(summary).length;
  const participantCount = uniqueItems(summary.participants).length;
  const trends = deriveTrends(contentType, transcriptText, summary);
  const insights: string[] = [];

  if (contentType === "lecture") {
    insights.push(
      keyPointCount > 0
        ? `${keyPointCount} key concept(s) were captured from the session for later review.`
        : "The session is primarily instructional and centers on concept transfer.",
    );
    insights.push(
      transcriptText.split(/\s+/).filter(Boolean).length > 250
        ? "The session provided extended explanatory detail, indicating deeper instructional coverage."
        : "The content appears concise and focused on a limited set of concepts.",
    );
  } else if (contentType === "interview") {
    insights.push(
      participantCount > 0
        ? `${participantCount} participant(s) contributed to an information-driven exchange.`
        : "The conversation appears to be an information-gathering exchange.",
    );
    insights.push(
      keyPointCount > 0
        ? `${keyPointCount} primary topic(s) were identified across the discussion.`
        : "Only limited structured insights could be extracted from the conversation.",
    );
  } else {
    insights.push(
      participantCount > 0
        ? `${participantCount} participant(s) contributed across ${keyPointCount || 0} primary discussion point(s).`
        : `${keyPointCount || 0} primary discussion point(s) were captured in the session record.`,
    );

    if (actionCount > 0 && actionCount >= Math.max(decisionCount, 1)) {
      insights.push("The discussion placed stronger emphasis on execution and follow-up than on formal approvals.");
    } else if (decisionCount > 0) {
      insights.push(`${decisionCount} documented decision(s) indicate clear directional alignment from the meeting.`);
    }

    insights.push(
      riskCount > 0
        ? `${riskCount} risk or concern item(s) should be tracked before closure.`
        : "No major blockers were explicitly documented in the structured summary.",
    );
  }

  insights.push(...trends);

  return uniqueItems(insights).slice(0, 3);
}

function deriveNotableResponses(transcript?: TranscriptEntry[] | string) {
  const entries = getTranscriptEntries(transcript);
  const responseCandidates: string[] = [];

  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];

    if (cleanText(previous.text).includes("?") && cleanText(current.text)) {
      responseCandidates.push(`${current.speaker}: ${cleanText(current.text).slice(0, 140)}`);
    }
  }

  return uniqueItems(responseCandidates).slice(0, 4);
}

function buildAsciiBar(value: number, maxValue: number, width = 12) {
  const safeMax = Math.max(maxValue, 1);
  const filled = Math.max(0, Math.min(width, Math.round((value / safeMax) * width)));
  const empty = width - filled;
  return `[${"#".repeat(filled)}${".".repeat(empty)}]`;
}

function normalizeReportHeading(reportText: string) {
  return reportText.replace(/Printable Summary Report/g, "Summary Report").trim();
}

function stripVisualizationSection(reportText: string) {
  return normalizeReportHeading(reportText).replace(/\n*\n---\n\nIX\.\s*Visual Snapshot[\s\S]*$/i, "").trim();
}

export function getSummaryVisualMetrics(summary: MeetingSummary, transcript?: TranscriptEntry[] | string): SummaryVisualMetric[] {
  const contentType = resolveContentType(summary, transcript);
  const discussionCount = getMeaningfulKeyPoints(summary).length || summary.keyPoints.length;
  const metrics = [
    {
      key: "advantages" as const,
      label: "Advantages",
      value: deriveAdvantages(summary, contentType).length,
      description: "Positive outcomes and strengths captured from the session summary.",
    },
    {
      key: "actions" as const,
      label: "Action Items",
      value: getFormattedActionItems(summary).length,
      description: "Assigned follow-up items requiring execution after the session.",
    },
    {
      key: "decisions" as const,
      label: "Decisions",
      value: getMeaningfulDecisions(summary).length,
      description: "Formal decisions documented for alignment and follow-through.",
    },
    {
      key: "risks" as const,
      label: "Risks",
      value: getMeaningfulRisks(summary).length,
      description: "Risks, blockers, dependencies, or concerns raised during the session.",
    },
    {
      key: "participants" as const,
      label: "Participants",
      value: summary.participants.filter((participant) => cleanText(participant)).length,
      description: "Number of identified contributors represented in the session record.",
    },
    {
      key: "discussion" as const,
      label: contentType === "lecture" ? "Key Concepts" : contentType === "interview" ? "Topics" : "Discussion Points",
      value: discussionCount,
      description: "Primary topics, concepts, or discussion points extracted from the session.",
    },
  ].filter((metric) => metric.value > 0);

  if (metrics.length === 0) {
    return [];
  }

  const maxValue = Math.max(...metrics.map((metric) => metric.value), 1);

  return metrics.map((metric) => ({
    ...metric,
    percent: Math.max(18, Math.round((metric.value / maxValue) * 100)),
  }));
}

export function buildVisualizationSection(summary: MeetingSummary, transcript?: TranscriptEntry[] | string) {
  const contentType = resolveContentType(summary, transcript);
  const metrics = getSummaryVisualMetrics(summary, transcript);
  const advantages = deriveAdvantages(summary, contentType);

  if (metrics.length === 0 && advantages.length === 0) {
    return "";
  }

  const maxValue = Math.max(...metrics.map((metric) => metric.value), 1);
  const lines = ["---", "", "IX. Visual Snapshot", ""];

  if (metrics.length > 0) {
    lines.push("Metric Overview:", "");
    metrics.forEach((metric) => {
      lines.push(`- ${metric.label}: ${metric.value} ${buildAsciiBar(metric.value, maxValue)}`);
    });
  }

  if (advantages.length > 0) {
    lines.push("", "Advantages / Strengths:", "", ...advantages.map((item) => `- ${item}`));
  }

  return lines.join("\n").trim();
}

function isEnterprisePrintableReport(reportText: string) {
  return reportText.includes(REPORT_HEADER) && reportText.includes(REPORT_SEPARATOR);
}

export function buildPrintableSummaryReport(summary: MeetingSummary, options: PrintableReportOptions = {}) {
  const existingReport = summary.printableReport?.trim();
  if (existingReport && isEnterprisePrintableReport(existingReport)) {
    return stripVisualizationSection(existingReport);
  }

  const {
    meetingDate,
    transcript,
    meetingTitle,
    duration,
    generatedAt,
  } = options;

  const contentType = resolveContentType(summary, transcript);
  const overview = cleanText(summary.executiveSummary) || "A formal summary was not available in the session record.";
  const conclusion =
    cleanText(summary.conclusion) ||
    (contentType === "lecture"
      ? "The session concluded with a structured set of instructional takeaways for future reference."
      : contentType === "interview"
        ? "The conversation concluded with its primary insights documented for future reference."
        : "The meeting concluded with the main outcomes documented for stakeholder reference.");
  const reportTitle =
    cleanText(meetingTitle) ||
    cleanText(summary.title) ||
    (contentType === "lecture"
      ? "Educational Session Summary"
      : contentType === "interview"
        ? "Interview Summary"
        : "Meeting Summary");
  const participants = uniqueItems(summary.participants);
  const aiInsights = buildAiInsights(summary, contentType, transcript);

  const riskLevel = getMeaningfulRisks(summary).length > 0 ? "Medium-High" : "Low-Medium";
  const reportObjective = `The objective of this report is to provide a comprehensive analysis of the ${reportTitle.toLowerCase()}, highlighting key discussion points, decisions, action items, and recommendations for follow-up.`;
  const documentProfile = [
    `The ${reportTitle.toLowerCase()} included ${participants.length} participant(s) and covered ${getMeaningfulKeyPoints(summary).length || 1} key discussion point(s).`,
    `${getMeaningfulDecisions(summary).length} formal decision(s) were documented, and ${getMeaningfulRisks(summary).length} concern(s) or risk(s) were identified.`,
  ];

  return [
    REPORT_HEADER,
    REPORT_CLASSIFICATION,
    "",
    REPORT_FIELD_HINT,
    REPORT_SEPARATOR,
    "",
    `Generated: ${formatReportTimestamp(generatedAt || meetingDate || summary.date)}`,
    `Overall Risk Rating: ${riskLevel}. ${getMeaningfulRisks(summary).length > 0 ? getMeaningfulRisks(summary)[0] || "Key risks identified in the meeting discussion." : "No significant risks identified in the meeting discussion."}`,
    `Report Type: Meeting Summary Report: ${overview.substring(0, 100)}${overview.length > 100 ? "..." : ""}`,
    "",
    REPORT_SEPARATOR,
    "",
    "Report Objective",
    reportObjective,
    "",
    "Document Profile",
    ...documentProfile.map((line) => `• ${line}`),
    "",
    REPORT_SEPARATOR,
    "",
    "Executive Summary",
    overview,
    "",
    REPORT_SEPARATOR,
    "",
    "Overall Risk Rating",
    `${riskLevel}. ${getMeaningfulRisks(summary).length > 0 ? getMeaningfulRisks(summary)[0] || "Key risks identified." : "No significant risks identified."}`,
    "",
    REPORT_SEPARATOR,
    "",
    "Critical Issues",
    formatEnterpriseBulletSection(getMeaningfulRisks(summary).slice(0, 3), "No critical issues identified."),
    "",
    REPORT_SEPARATOR,
    "",
    "Key Obligations",
    formatEnterpriseBulletSection(getMeaningfulKeyPoints(summary).slice(0, 3), "No key obligations specified."),
    "",
    REPORT_SEPARATOR,
    "",
    "Missing Protections / Negotiation Gaps",
    formatEnterpriseBulletSection(
      [
        ...getMeaningfulDecisions(summary).slice(0, 2).map((d) => `Follow-up needed on: ${d}`),
      ],
      "No negotiation gaps identified.",
    ),
    "",
    REPORT_SEPARATOR,
    "",
    "Recommended Actions",
    formatEnterpriseBulletSection(
      getFormattedActionItems(summary).slice(0, 4).length > 0
        ? getFormattedActionItems(summary).slice(0, 4)
        : aiInsights.slice(0, 3),
      "No action items identified.",
    ),
    "",
    REPORT_SEPARATOR,
    "",
    "Conclusion",
    conclusion,
    "",
    REPORT_SEPARATOR,
    "",
    "Appendix - Supporting Notes",
    ...aiInsights.slice(0, 3).map((note) => `• ${note}`),
    participants.length > 0 ? `• Participants identified: ${participants.join(", ")}` : "",
    `• Duration: ${normalizeDuration(duration)}`,
    "",
    REPORT_SEPARATOR,
  ]
    .filter(Boolean)
    .join("\n");
}

