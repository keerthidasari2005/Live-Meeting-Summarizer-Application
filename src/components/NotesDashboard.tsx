import { useState, useEffect } from "react";
import { Plus, Save, Download, Clock, FileText, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Input } from "./ui/input";
import { useMeetingStore } from "@/hooks/useMeetingStore";
import { loadMeetingNotes, saveMeetingNotes, type MeetingNote } from "@/lib/meetingNotes";

export function NotesDashboard() {
  const [notes, setNotes] = useState<MeetingNote[]>([]);
  const [currentNote, setCurrentNote] = useState<Pick<MeetingNote, "id" | "title" | "content" | "meetingId" | "meetingTitle"> | null>(null);
  const { currentMeeting } = useMeetingStore();
  const meetingContextTitle = currentMeeting?.summary?.title || currentMeeting?.title || "Selected meeting";

  useEffect(() => {
    setNotes(loadMeetingNotes());
  }, []);

  const saveNote = () => {
    if (!currentNote || !currentNote.content.trim()) return;
    
    const newNotes = currentNote.id
      ? notes.map(n => n.id === currentNote.id ? { ...n, ...currentNote, date: n.date } : n)
      : [{
          ...currentNote,
          id: Date.now().toString(),
          date: new Date().toISOString(),
          meetingId: currentNote.meetingId || currentMeeting?.id,
          meetingTitle: currentNote.meetingTitle || meetingContextTitle,
        }, ...notes];
      
    setNotes(newNotes);
    saveMeetingNotes(newNotes);
    setCurrentNote(null);
  };

  const exportNote = (note: any) => {
    const blob = new Blob([`${note.title}\n\n${note.content}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${note.title || "Meeting_Note"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteNote = (id: string) => {
    const newNotes = notes.filter(n => n.id !== id);
    setNotes(newNotes);
    saveMeetingNotes(newNotes);
  };

  return (
    <div className="flex flex-col h-full space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading">My Notes</h1>
          <p className="text-sm text-muted-foreground">Take private notes during live meetings and save them for later.</p>
        </div>
        <Button
          onClick={() => setCurrentNote({
            id: "",
            title: currentMeeting ? meetingContextTitle : "",
            content: "",
            meetingId: currentMeeting?.id,
            meetingTitle: currentMeeting ? meetingContextTitle : undefined,
          })}
          className="gap-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white shadow-sm"
        >
          <Plus className="h-4 w-4" /> Start New Note
        </Button>
      </div>

      {currentMeeting && currentNote === null && (
        <div className="rounded-xl border border-[#8b5cf6]/20 bg-[#8b5cf6]/5 px-4 py-3 text-sm text-muted-foreground">
          Notes you create right now will be linked to <span className="font-semibold text-foreground">{meetingContextTitle}</span>.
        </div>
      )}

      {currentNote !== null ? (
        <div className="bg-white dark:bg-card border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-4 animate-in fade-in duration-300">
          <Input 
            value={currentNote.title} 
            onChange={e => setCurrentNote({...currentNote, title: e.target.value})}
            placeholder="Meeting Note Title (e.g. Weekly Standup)" 
            className="text-xl font-bold border-0 border-b border-gray-100 rounded-none focus-visible:ring-0 px-0 pb-3"
          />
          <Textarea 
            value={currentNote.content}
            onChange={e => setCurrentNote({...currentNote, content: e.target.value})}
            placeholder="Type your notes from the live meeting here..." 
            className="min-h-[300px] text-[15px] leading-relaxed resize-none border-0 focus-visible:ring-0 px-0 pt-2"
          />
          <div className="flex items-center gap-3 justify-end border-t border-gray-100 pt-4 mt-2">
            <Button variant="ghost" onClick={() => setCurrentNote(null)}>Cancel</Button>
            <Button onClick={saveNote} className="gap-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white">
              <Save className="h-4 w-4" /> Save Note
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-card border border-gray-200 rounded-xl shadow-sm flex-1 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100 bg-slate-50/50">
            <h3 className="font-semibold flex items-center gap-2 text-gray-800">
               <Clock className="h-4 w-4 text-[#8b5cf6]" /> Saved Notes History
            </h3>
          </div>
          <div className="p-5 flex-1 overflow-y-auto space-y-3">
            {notes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 py-12 opacity-80">
                <div className="h-16 w-16 bg-[#8b5cf6]/10 rounded-full flex items-center justify-center">
                  <FileText className="h-8 w-8 text-[#8b5cf6]" />
                </div>
                <p className="text-sm">No saved notes yet. Start a new note during your next meeting!</p>
              </div>
            ) : (
              notes.map(note => (
                <div key={note.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-[#8b5cf6]/50 hover:shadow-sm transition-all bg-white group">
                  <div className="mb-3 sm:mb-0 cursor-pointer flex-1 mr-4" onClick={() => setCurrentNote(note)}>
                    <h4 className="font-semibold text-[15px] text-gray-800">{note.title || "Untitled Note"}</h4>
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                      <span className="font-medium text-gray-500 mr-2">{new Date(note.date).toLocaleString()}</span>
                      {note.content}
                    </p>
                    {note.meetingTitle && (
                      <p className="text-xs text-[#8b5cf6] font-medium mt-2">
                        Linked to {note.meetingTitle}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5 border-gray-200" onClick={() => exportNote(note)}>
                      <Download className="h-3.5 w-3.5" /> Export
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-50 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteNote(note.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
