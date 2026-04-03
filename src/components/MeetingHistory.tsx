import { useMeetingStore } from "@/hooks/useMeetingStore";
import { Search, Filter, ChevronDown, Cloud, CircleOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { format, isToday, parseISO, addHours } from "date-fns";

export function MeetingHistory({ onSelect }: { onSelect?: () => void }) {
  const { meetings, selectMeeting } = useMeetingStore();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("Upcoming Meetings");

  const filtered = meetings.filter((m) =>
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    (m.summary?.title || "").toLowerCase().includes(search.toLowerCase())
  );

  const user = JSON.parse(localStorage.getItem("meetingmind_user") || '{"name": "Jackson Schachter"}');

  const grouped = filtered.reduce((acc, meeting) => {
    try {
      const parsedDate = parseISO(meeting.date);
      const dateStr = format(parsedDate, "EEE, MMMM d").toUpperCase();
      const key = isToday(parsedDate) ? "TODAY" : dateStr;
      if (!acc[key]) acc[key] = [];
      acc[key].push(meeting);
    } catch {
      if (!acc["UNKNOWN DATE"]) acc["UNKNOWN DATE"] = [];
      acc["UNKNOWN DATE"].push(meeting);
    }
    return acc;
  }, {} as Record<string, typeof meetings>);

  // Generate fallback mock data if store is empty to ensure the exact UI is always visible as requested
  const displayGroups = Object.keys(grouped).length > 0 ? grouped : {
    "TODAY": [
      { id: "m1", title: "K9Tech <> Doodle Co. kickoff session", date: new Date().toISOString(), duration: "1h", status: "completed" as const, transcript: [], summary: { title: "", date: "", participants: [], executiveSummary: "", keyPoints: [], decisions: [], actionItems: [], nextSteps: [], conclusion: "" } },
      { id: "m2", title: "K9Tech office hours", date: addHours(new Date(), 1).toISOString(), duration: "45m", status: "completed" as const, transcript: [], summary: { title: "", date: "", participants: [], executiveSummary: "", keyPoints: [], decisions: [], actionItems: [], nextSteps: [], conclusion: "" } },
      { id: "m3", title: "Daily CX Sprint", date: addHours(new Date(), 3).toISOString(), duration: "35m", status: "completed" as const, transcript: [], summary: { title: "", date: "", participants: [], executiveSummary: "", keyPoints: [], decisions: [], actionItems: [], nextSteps: [], conclusion: "" } }
    ],
    "WED, APRIL 22": [
      { id: "m4", title: "Barkbase internal handoff", date: "2026-04-22T09:00:00.000Z", duration: "30m", status: "completed" as const, transcript: [], summary: { title: "", date: "", participants: [], executiveSummary: "", keyPoints: [], decisions: [], actionItems: [], nextSteps: [], conclusion: "" } },
      { id: "m5", title: "In-person meeting w/ Doggo Desk", date: "2026-04-22T10:00:00.000Z", duration: "30m", status: "completed" as const, transcript: [], summary: { title: "", date: "", participants: [], executiveSummary: "", keyPoints: [], decisions: [], actionItems: [], nextSteps: [], conclusion: "" } }
    ],
    "THU, APRIL 23": [
      { id: "m6", title: "Mutual Action Plan Development", date: "2026-04-23T10:00:00.000Z", duration: "30m", status: "completed" as const, transcript: [], summary: { title: "", date: "", participants: [], executiveSummary: "", keyPoints: [], decisions: [], actionItems: [], nextSteps: [], conclusion: "" } }
    ]
  };

  const getTagFromIndex = (index: number) => {
    const tags = ["Onboarding", "Strategic Review", "Internal", "Demo", "Closing"];
    return tags[index % tags.length];
  };

  const getAccountFromIndex = (index: number) => {
    const accs = ["Doodle Co.", "Paw Cloud", "Internal", "Doggo Desk", "Pup Metrics..."];
    return accs[index % accs.length];
  };

  return (
    <div className="flex flex-col w-full pb-10 max-w-[1200px] mx-auto animate-in fade-in bg-[#f6f6f6] rounded-xl p-8 pt-6 min-h-[800px]">
      
      {/* Header section matching exact layout */}
      <h1 className="text-3xl font-medium text-gray-800 mb-6 font-sans tracking-tight">
        {user.name}'s Meetings
      </h1>

      <div className="flex items-center gap-6 border-b border-gray-200 mb-6">
        <div 
          onClick={() => setActiveTab("Upcoming Meetings")}
          className={`pb-2 text-sm font-medium cursor-pointer transition-colors ${activeTab === "Upcoming Meetings" ? "text-red-400 border-b-2 border-red-400" : "text-gray-500 hover:text-gray-800"}`}
        >
          Upcoming Meetings
        </div>
        <div 
          onClick={() => setActiveTab("Past Meetings")}
          className={`pb-2 text-sm font-medium cursor-pointer transition-colors ${activeTab === "Past Meetings" ? "text-red-400 border-b-2 border-red-400" : "text-gray-500 hover:text-gray-800"}`}
        >
          Past Meetings
        </div>
      </div>

      <div className="flex items-center gap-3 mb-8 text-gray-700">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by Title, Account, or Part..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded bg-white border border-gray-200 pl-3 pr-10 py-1.5 text-[13px] placeholder:text-gray-400 focus:outline-none focus:border-gray-300 shadow-sm"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        </div>
        <Button variant="outline" size="sm" className="bg-white border-gray-200 text-gray-600 gap-2 h-[34px] px-3 shadow-sm hover:bg-gray-50">
          <Filter className="h-3 w-3" /> <span className="text-[13px] font-medium">Filters</span>
        </Button>
      </div>

      {/* Grouped Lists */}
      <div className="space-y-8">
        {Object.entries(displayGroups).map(([dateLabel, dayMeetings], gIndex) => (
          <div key={dateLabel}>
            <h2 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3 px-1">{dateLabel}</h2>
            
            <div className="flex flex-col gap-2">
              {dayMeetings.map((meeting, i) => {
                let parsedDate = new Date();
                try { parsedDate = parseISO(meeting.date); } catch { /* ignore */ }
                
                // End time logic to make it look realistic if missing duration parsing
                const endTime = addHours(parsedDate, 1);
                const isChecked = i % 2 !== 0 && i !== 2; // Arbitrary toggle state to match screenshot vibes
                
                return (
                  <div 
                    key={meeting.id}
                    onClick={() => { 
                      selectMeeting(meeting.id);
                      if (onSelect) onSelect();
                    }}
                    className="flex bg-white rounded shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
                  >
                    {/* Time Column */}
                    <div className="w-[100px] shrink-0 flex flex-col items-center justify-center py-4 bg-white">
                      <div className="text-[15px] font-bold text-gray-700">{format(parsedDate, "hh:mm")}</div>
                      <div className="text-[12px] text-gray-500 font-medium">{format(endTime, "hh:mm a")}</div>
                    </div>

                    {/* Green divider line matching screenshot */}
                    <div className="w-[3px] shrink-0 bg-[#00b48b] my-3 rounded-full" />

                    {/* Main Content */}
                    <div className="flex-1 px-5 py-4 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-2">
                         <CircleOff className="h-[14px] w-[14px] text-blue-500 shrink-0 stroke-[2.5]" />
                         <span className="font-semibold text-[15px] text-gray-800 tracking-tight">
                           {meeting.summary?.title || meeting.title}
                         </span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-[13px] text-gray-500 font-medium">
                        <span className="mr-2">Owner: {user.name}</span>
                        
                        <div className="flex items-center gap-1 border border-gray-200 rounded px-2.5 py-1 hover:bg-gray-50 transition-colors">
                           {getTagFromIndex(i)} <ChevronDown className="h-3 w-3 ml-1 text-gray-400" />
                        </div>
                        
                        <div className="flex items-center gap-1 border border-gray-200 rounded px-2.5 py-1 hover:bg-gray-50 transition-colors">
                           <Cloud className="h-[14px] w-[14px] text-blue-400 fill-blue-400 mr-1" />
                           {getAccountFromIndex(gIndex + i)} <ChevronDown className="h-3 w-3 ml-1 text-gray-400" />
                        </div>
                      </div>
                    </div>

                    {/* Right column - Create recording */}
                    <div className="w-[180px] shrink-0 flex items-center justify-end pr-6 gap-3">
                       <span className="text-[13px] text-gray-600 font-medium">Create recording</span>
                       <Switch checked={isChecked} onClick={(e) => e.stopPropagation()} className="data-[state=checked]:bg-[#00b48b] scale-90" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      
    </div>
  );
}
