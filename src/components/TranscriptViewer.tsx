import { useRef, useEffect } from "react";
import { useMeetingStore } from "@/hooks/useMeetingStore";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquareText } from "lucide-react";

export function TranscriptViewer() {
  const { currentMeeting } = useMeetingStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const transcript = currentMeeting?.transcript ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript.length]);

  if (!currentMeeting) {
    return (
      <div className="glass-card p-8 flex flex-col items-center justify-center min-h-[300px] text-muted-foreground">
        <MessageSquareText className="h-12 w-12 mb-3 opacity-40" />
        <p className="font-heading text-lg">No transcript yet</p>
        <p className="text-sm">Start a meeting to see the live transcript here</p>
      </div>
    );
  }

  return (
    <div className="glass-card flex flex-col max-h-[500px]">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-heading font-semibold text-sm">Live Transcript</h3>
        <span className="text-xs text-muted-foreground">{transcript.length} entries</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <AnimatePresence initial={false}>
          {transcript.map((entry) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex gap-3"
            >
              <span className="text-xs text-muted-foreground font-mono mt-1 shrink-0">{entry.timestamp}</span>
              <div className="flex-1">
                <span
                  className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1"
                  style={{ backgroundColor: entry.speakerColor + "22", color: entry.speakerColor }}
                >
                  {entry.speaker}
                </span>
                <p className="text-sm leading-relaxed">{entry.text}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
