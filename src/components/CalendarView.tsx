import { useMemo, useState } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { useMeetingStore } from "@/hooks/useMeetingStore";
import { Calendar as CalendarIcon, Clock, Users, Video, FileText, Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getMeetingNotesForSession, loadMeetingNotes } from "@/lib/meetingNotes";
import type { Meeting } from "@/types/meeting";

export function CalendarView({ onSelect }: { onSelect?: () => void }) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [notesMeeting, setNotesMeeting] = useState<Meeting | null>(null);
  const { meetings, selectMeeting } = useMeetingStore();
  const storedNotes = useMemo(() => loadMeetingNotes(), [notesMeeting]);

  const selectedDateMeetings = date
    ? meetings.filter((m) => {
        try {
          return isSameDay(parseISO(m.date), date);
        } catch {
          return false;
        }
      })
    : [];

  const handleViewNotes = (meeting: Meeting) => {
    selectMeeting(meeting.id);
    setNotesMeeting(meeting);
  };

  const meetingNotes = notesMeeting ? getMeetingNotesForSession(storedNotes, notesMeeting) : [];

  // Find dates that have meetings
  const meetingDates = meetings.map(m => {
    try {
      return parseISO(m.date);
    } catch {
      return null;
    }
  }).filter(Boolean) as Date[];

  return (
    <div className="w-full flex flex-col h-full animate-in fade-in duration-500">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <CalendarIcon className="h-8 w-8 text-violet-500" />
            Calendar
          </h1>
          <p className="text-muted-foreground">Manage your past meetings and upcoming schedule.</p>
        </div>
        
        <Button onClick={() => onSelect?.()} className="bg-violet-500 hover:bg-violet-600 text-white rounded-full">
          <Plus className="mr-2 h-4 w-4" /> Schedule New
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Calendar Sidebar */}
        <div className="md:col-span-4 lg:col-span-4 space-y-6">
          <div className="glass-card p-4 rounded-2xl border bg-card/50 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-[40px] -mr-16 -mt-16 pointer-events-none" />
            
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="w-full flex justify-center"
              modifiers={{
                hasMeeting: meetingDates
              }}
              modifiersStyles={{
                hasMeeting: { fontWeight: "bold", borderBottom: "2px solid #22c55e" }
              }}
            />
          </div>

          <div className="glass-card p-6 rounded-2xl flex flex-col space-y-4 shadow-sm border bg-card/50">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              <h3 className="font-bold text-lg">AI Schedule Insights</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Based on your history, you have most of your meetings on <strong>Tuesdays</strong> around <strong>10:00 AM</strong>. Scheduling focus time on Wednesday afternoons is highly recommended.
            </p>
          </div>
        </div>

        {/* Selected Date Timeline */}
        <div className="md:col-span-8 lg:col-span-8 flex flex-col min-h-[500px]">
          <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
            <h2 className="text-xl font-bold">
              {date ? format(date, "EEEE, MMMM do, yyyy") : "Select a date"}
            </h2>
            <Badge variant="secondary" className="bg-violet-500/10 text-violet-500 border-none font-medium">
              {selectedDateMeetings.length} Meeting{selectedDateMeetings.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          <div className="flex-1 space-y-4">
            {selectedDateMeetings.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-2xl bg-card/30">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <CalendarIcon className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="font-bold text-lg mb-1">No meetings scheduled</h3>
                <p className="text-muted-foreground mb-6">You don't have any meeting records for this date.</p>
              </div>
            ) : (
              selectedDateMeetings.map((meeting) => (
                <div 
                  key={meeting.id} 
                  className="group relative flex flex-col sm:flex-row p-5 gap-5 rounded-2xl border bg-card hover:bg-accent/5 transition-all duration-300 shadow-sm hover:shadowglow-border"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-violet-500 rounded-l-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="flex flex-col min-w-[120px] items-start pt-1">
                    <span className="font-bold text-lg">{format(parseISO(meeting.date), "h:mm a")}</span>
                    <span className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3" /> {meeting.duration || "Ended"}
                    </span>
                  </div>

                  <div className="flex-[2] flex flex-col gap-2">
                    <h3 className="font-bold text-lg group-hover:text-violet-500 transition-colors">
                      {meeting.summary ? meeting.summary.title : meeting.title}
                    </h3>
                    
                    <div className="flex flex-wrap items-center gap-2 text-sm mt-1 text-muted-foreground">
                      {meeting.summary?.participants?.length ? (
                        <div className="flex items-center gap-1.5">
                          <Users className="h-4 w-4 text-violet-500" />
                          <span>{meeting.summary.participants.length} Participants</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs font-normal">No Participants Detected</Badge>
                      )}
                      
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/30 mx-1"></span>
                      
                      <div className="flex items-center gap-1.5">
                        <Video className="h-4 w-4 text-blue-500" />
                        <span>MeetingMind Sync</span>
                      </div>
                    </div>

                    {meeting.summary && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                        {meeting.summary.executiveSummary || meeting.summary.keyPoints[0]}
                      </p>
                    )}
                  </div>

                  <div className="flex sm:flex-col justify-center sm:justify-start items-center gap-3 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => handleViewNotes(meeting)}
                      className="rounded-full shadow-sm hover:bg-violet-50 hover:text-violet-600 hover:border-violet-200 dark:hover:bg-violet-900/20 dark:hover:text-violet-400 dark:hover:border-violet-800 transition-colors w-full sm:w-auto"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      View Notes
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Dialog open={Boolean(notesMeeting)} onOpenChange={(open) => !open && setNotesMeeting(null)}>
        <DialogContent className="max-w-2xl rounded-2xl border-border/60">
          <DialogHeader>
            <DialogTitle>Session Notes</DialogTitle>
            <DialogDescription>
              {notesMeeting
                ? `Notes for ${notesMeeting.summary?.title || notesMeeting.title} on ${format(parseISO(notesMeeting.date), "EEEE, MMMM do, yyyy 'at' h:mm a")}`
                : "Meeting notes"}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
            {meetingNotes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-5 py-10 text-center">
                <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
                <h4 className="font-semibold text-base">No notes have been taken</h4>
                <p className="text-sm text-muted-foreground mt-2">
                  This meeting session does not have any saved notes yet.
                </p>
              </div>
            ) : (
              meetingNotes.map((note) => (
                <div key={note.id} className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-base">{note.title || "Untitled Note"}</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(note.date).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground mt-4 whitespace-pre-wrap">
                    {note.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
