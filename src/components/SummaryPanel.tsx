import { useMeetingStore } from "@/hooks/useMeetingStore";
import { motion } from "framer-motion";
import { Brain, Copy, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportEmailButton } from "@/components/ReportEmailButton";
import { buildPrintableSummaryReport, buildVisualizationSection } from "@/lib/meetingReport";
import { exportReport } from "@/lib/reportExport";

export function SummaryPanel() {
  const { currentMeeting, status } = useMeetingStore();
  const summary = currentMeeting?.summary;
  const reportText = summary
    ? buildPrintableSummaryReport(summary, {
        meetingDate: currentMeeting?.date,
        transcript: currentMeeting?.transcript,
        meetingTitle: currentMeeting?.title,
        duration: currentMeeting?.duration,
      })
    : "";
  const visualSection = summary ? buildVisualizationSection(summary, currentMeeting?.transcript) : "";

  const copyToClipboard = () => {
    if (!reportText) return;
    navigator.clipboard.writeText(reportText);
  };

  const handleExport = async (format: "pdf" | "docx") => {
    if (!summary || !reportText) return;
    await exportReport({
      title: currentMeeting?.title || summary.title,
      reportText,
      format,
      visualSection,
    });
  };

  if (status === "generating") {
    return (
      <div className="glass-card p-8 flex flex-col items-center justify-center min-h-[300px]">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
          <Brain className="h-10 w-10 text-primary" />
        </motion.div>
        <p className="mt-4 font-heading font-semibold gradient-text">Generating AI Summary...</p>
        <p className="text-sm text-muted-foreground mt-1">Analyzing transcript and extracting key insights</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="glass-card p-8 flex flex-col items-center justify-center min-h-[300px] text-muted-foreground">
        <Brain className="h-12 w-12 mb-3 opacity-40" />
        <p className="font-heading text-lg">AI Summary</p>
        <p className="text-sm">Summary will be generated after the meeting ends</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-heading font-semibold text-sm">AI Meeting Summary</h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={copyToClipboard} title="Copy">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void handleExport("pdf")} title="Export PDF" className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void handleExport("docx")} title="Export DOCX" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> DOCX
          </Button>
          <ReportEmailButton
            title={currentMeeting?.title || summary.title}
            reportText={reportText}
            visualSection={visualSection}
            triggerLabel="Email"
            triggerVariant="ghost"
            triggerSize="sm"
            buttonClassName="gap-1.5"
          />
        </div>
      </div>
      <div className="p-4 overflow-y-auto max-h-[500px]">
        <div className="rounded-2xl border border-border bg-card/60 px-5 py-4 text-sm leading-7 whitespace-pre-wrap text-foreground">
          {reportText}
        </div>
      </div>
    </motion.div>
  );
}
