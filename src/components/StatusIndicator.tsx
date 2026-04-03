import type { MeetingStatus } from "@/types/meeting";
import { Loader2, Mic, Brain, CheckCircle2, Radio, Ear } from "lucide-react";

const statusConfig: Record<MeetingStatus, { label: string; icon: React.ElementType; className: string }> = {
  idle: { label: "Ready", icon: CheckCircle2, className: "text-muted-foreground" },
  recording: { label: "Recording", icon: Radio, className: "text-destructive animate-pulse" },
  listening: { label: "Listening", icon: Ear, className: "text-primary animate-pulse" },
  transcribing: { label: "Transcribing", icon: Loader2, className: "text-accent animate-spin" },
  processing: { label: "Processing", icon: Loader2, className: "text-primary animate-spin" },
  generating: { label: "Generating Summary", icon: Brain, className: "text-accent animate-pulse" },
  completed: { label: "Completed", icon: CheckCircle2, className: "text-accent" },
};

export function StatusIndicator({ status }: { status: MeetingStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2 text-sm font-medium">
      <Icon className={`h-4 w-4 ${config.className}`} />
      <span className={config.className}>{config.label}</span>
      {(status === "recording" || status === "listening") && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
        </span>
      )}
    </div>
  );
}
