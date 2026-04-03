import { useRef, useCallback, useState } from "react";
import { useMeetingStore } from "./useMeetingStore";
import { SPEAKER_COLORS } from "@/types/meeting";

const LIVE_SPEAKER_NAME = "Speaker 1";
const LIVE_SPEAKER_COLOR = SPEAKER_COLORS[0];

export function useRecording() {
  const { addTranscriptEntry, setStatus } = useMeetingStore();
  const recognitionRef = useRef<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const startRecording = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      if (!result.isFinal) return;
      const text = result[0].transcript.trim();
      if (!text) return;

      // Browser speech recognition does not provide reliable speaker diarization.
      // Keep one stable speaker label instead of inventing extra participants.
      const entry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
        speaker: LIVE_SPEAKER_NAME,
        text,
        speakerColor: LIVE_SPEAKER_COLOR,
      };
      addTranscriptEntry(entry);
      setStatus("transcribing");
      setTimeout(() => setStatus("recording"), 500);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== "no-speech") {
        setIsRecording(false);
        setStatus("idle");
      }
    };

    recognition.onend = () => {
      // Restart if still recording
      if (recognitionRef.current && isRecording && !isPaused) {
        try { recognition.start(); } catch {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setIsPaused(false);
    setStatus("listening");
  }, [addTranscriptEntry, setStatus, isRecording, isPaused]);

  const pauseRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsPaused(true);
      setStatus("recording");
    }
  }, [setStatus]);

  const resumeRecording = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.start(); } catch {}
      setIsPaused(false);
      setStatus("listening");
    }
  }, [setStatus]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
  }, []);

  return { isRecording, isPaused, startRecording, pauseRecording, resumeRecording, stopRecording };
}
