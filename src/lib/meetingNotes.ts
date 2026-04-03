import { isSameDay, parseISO } from "date-fns";
import type { Meeting } from "@/types/meeting";

export type MeetingNote = {
  id: string;
  title: string;
  content: string;
  date: string;
  meetingId?: string;
  meetingTitle?: string;
};

export const MEETING_NOTES_STORAGE_KEY = "meetingmind_personal_notes";

function safeParse(value: string | null): unknown {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isMeetingNote(value: unknown): value is MeetingNote {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "title" in value &&
      "content" in value &&
      "date" in value &&
      typeof value.id === "string" &&
      typeof value.title === "string" &&
      typeof value.content === "string" &&
      typeof value.date === "string" &&
      (!("meetingId" in value) || value.meetingId === undefined || typeof value.meetingId === "string") &&
      (!("meetingTitle" in value) || value.meetingTitle === undefined || typeof value.meetingTitle === "string"),
  );
}

export function loadMeetingNotes(): MeetingNote[] {
  const parsed = safeParse(localStorage.getItem(MEETING_NOTES_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(isMeetingNote);
}

export function saveMeetingNotes(notes: MeetingNote[]) {
  localStorage.setItem(MEETING_NOTES_STORAGE_KEY, JSON.stringify(notes));
}

export function getMeetingNotesForSession(notes: MeetingNote[], meeting: Meeting) {
  const linkedNotes = notes.filter((note) => note.meetingId === meeting.id);

  if (linkedNotes.length > 0) {
    return linkedNotes;
  }

  return notes.filter((note) => {
    if (note.meetingId) return false;

    try {
      return isSameDay(parseISO(note.date), parseISO(meeting.date));
    } catch {
      return false;
    }
  });
}
