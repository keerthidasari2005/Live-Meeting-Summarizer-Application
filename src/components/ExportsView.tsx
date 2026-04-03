import { useMeetingStore } from "@/hooks/useMeetingStore";
import { Download, FileText, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportEmailButton } from "@/components/ReportEmailButton";
import { buildPrintableSummaryReport, buildVisualizationSection } from "@/lib/meetingReport";
import { exportReport } from "@/lib/reportExport";

export function ExportsView() {
  const { meetings } = useMeetingStore();
  const completedMeetings = meetings.filter((meeting) => meeting.status === "completed" && meeting.summary);

  const handleDownload = async (meetingId: string, format: "pdf" | "docx") => {
    const meeting = meetings.find((item) => item.id === meetingId);
    if (!meeting || !meeting.summary) return;

    const reportText = buildPrintableSummaryReport(meeting.summary, {
      meetingDate: meeting.date,
      transcript: meeting.transcript,
      meetingTitle: meeting.title,
      duration: meeting.duration,
    });
    await exportReport({
      title: meeting.title,
      reportText,
      format,
      visualSection: buildVisualizationSection(meeting.summary, meeting.transcript),
    });
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-heading">Export Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Download summaries and transcripts from your past meetings.</p>
        </div>
      </div>

      {completedMeetings.length === 0 ? (
        <div className="text-center py-20 border-dashed border-2 rounded-xl border-border bg-muted/10">
          <FileText className="h-10 w-10 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-semibold mb-1">No completed meetings</h3>
          <p className="text-sm text-muted-foreground">Complete a meeting or upload a file to generate summaries for export.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {completedMeetings.map((meeting) => {
            const reportText = buildPrintableSummaryReport(meeting.summary!, {
              meetingDate: meeting.date,
              transcript: meeting.transcript,
              meetingTitle: meeting.title,
              duration: meeting.duration,
            });
            const visualSection = buildVisualizationSection(meeting.summary!, meeting.transcript);

            return (
              <div key={meeting.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card/50 hover:bg-muted/30 transition-colors">
                <div className="space-y-1 min-w-0">
                  <h4 className="font-semibold text-sm truncate">{meeting.summary?.title || meeting.title}</h4>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(meeting.date).toLocaleDateString()}
                    </span>
                    <span>{meeting.summary?.participants?.length || 0} Participants</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => void handleDownload(meeting.id, "pdf")} className="gap-2">
                    <Download className="h-4 w-4" /> PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void handleDownload(meeting.id, "docx")} className="gap-2">
                    <FileText className="h-4 w-4" /> DOCX
                  </Button>
                  <ReportEmailButton
                    title={meeting.title}
                    reportText={reportText}
                    visualSection={visualSection}
                    triggerLabel="Email"
                    triggerVariant="outline"
                    triggerSize="sm"
                    buttonClassName="gap-2"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
