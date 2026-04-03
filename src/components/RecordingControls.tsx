import { Mic, Pause, Square, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRecording } from "@/hooks/useRecording";
import { useMeetingStore } from "@/hooks/useMeetingStore";
import { motion } from "framer-motion";

export function RecordingControls() {
  const { isRecording, isPaused, startRecording, pauseRecording, resumeRecording, stopRecording } = useRecording();
  const { startNewMeeting, stopMeeting, status } = useMeetingStore();

  const handleStart = () => {
    startNewMeeting();
    startRecording();
  };

  const handleStop = () => {
    stopRecording();
    stopMeeting();
  };

  const handlePause = () => isPaused ? resumeRecording() : pauseRecording();

  if (!isRecording && status !== "generating") {
    return (
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-4">
        <Button variant="gradient" size="lg" onClick={handleStart} className="h-16 px-8 text-base gap-3 rounded-2xl">
          <Mic className="h-5 w-5" />
          Start New Meeting
        </Button>
        <p className="text-sm text-muted-foreground">Click to begin recording and transcribing</p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center gap-3">
      <Button variant="glass" size="lg" onClick={handlePause} disabled={status === "generating"} className="gap-2">
        {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        {isPaused ? "Resume" : "Pause"}
      </Button>
      <Button variant="destructive" size="lg" onClick={handleStop} disabled={status === "generating"} className="gap-2">
        <Square className="h-4 w-4" />
        Stop Recording
      </Button>
      {isRecording && !isPaused && (
        <div className="ml-2 flex items-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="w-1 rounded-full bg-primary"
              animate={{ height: [4, 16, 4] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
