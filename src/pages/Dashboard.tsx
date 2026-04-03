import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { RecordingControls } from "@/components/RecordingControls";
import { TranscriptViewer } from "@/components/TranscriptViewer";
import { SummaryPanel } from "@/components/SummaryPanel";
import { NotesDashboard } from "@/components/NotesDashboard";
import { StatusIndicator } from "@/components/StatusIndicator";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MeetingProvider, useMeetingStore } from "@/hooks/useMeetingStore";
import { Brain, Copy, FileText, LogOut, Sparkles, Upload, UserCircle2 } from "lucide-react";
import { FileUpload } from "@/components/FileUpload";
import { DashboardOverview } from "@/components/DashboardOverview";
import { ExportsView } from "@/components/ExportsView";
import { ReportsView } from "@/components/ReportsView";
import { CalendarView } from "@/components/CalendarView";
import { ChatBot } from "@/components/ChatBot";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { clearAuthenticatedSession, getAuthenticatedSession } from "@/lib/auth";
import type { DashboardView as View } from "@/types/dashboard";

function DashboardContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get("tab") as View | null;
  const view: View = rawView || "overview";

  const setView = (newView: View) => {
    setSearchParams({ tab: newView });
  };

  const { status, currentMeeting, activeWorkspace, clearCurrentMeeting } = useMeetingStore();
  const navigate = useNavigate();
  const user = getAuthenticatedSession();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) navigate("/");
  }, [user, navigate]);

  const handleLogout = () => {
    clearAuthenticatedSession();
    navigate("/");
  };

  const handleCopyEmail = async () => {
    if (!user?.email) return;

    try {
      await navigator.clipboard.writeText(user.email);
      toast({
        title: "Email copied",
        description: `${user.email} has been copied to your clipboard.`,
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Your browser blocked clipboard access for this action.",
        variant: "destructive",
      });
    }
  };

  const handleStartFreshMeeting = () => {
    clearCurrentMeeting();
    setView("meeting");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-[radial-gradient(circle_at_top_left,rgba(146,102,255,0.22),transparent_28%),radial-gradient(circle_at_top_right,rgba(255,182,224,0.32),transparent_32%),linear-gradient(180deg,#fbfaff_0%,#f4f1ff_46%,#f7f6ff_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(125,92,255,0.24),transparent_26%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_30%),linear-gradient(180deg,#09090f_0%,#0f1220_46%,#111827_100%)]">
        <AppSidebar currentView={view} onViewChange={setView} onLogout={handleLogout} />
        <div className="flex-1 flex min-w-0 flex-col relative">
          <header className="sticky top-0 z-20 border-b border-white/60 bg-white/70 backdrop-blur-2xl shadow-[0_18px_48px_-36px_rgba(109,87,201,0.35)] dark:border-white/10 dark:bg-slate-950/55 dark:shadow-[0_18px_48px_-36px_rgba(15,23,42,0.85)]">
            <div className="flex min-h-20 flex-wrap items-center justify-between gap-4 px-4 md:px-6">
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                <div className="flex items-center gap-3 rounded-full border border-white/70 bg-white/80 px-3 py-2 shadow-[0_10px_30px_-24px_rgba(90,78,160,0.4)] dark:border-white/10 dark:bg-slate-900/75 dark:shadow-[0_10px_30px_-24px_rgba(15,23,42,0.9)]">
                  <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#9b7bff_0%,#7d5cff_100%)] text-white shadow-[0_12px_30px_-18px_rgba(125,92,255,0.9)]">
                    <Brain className="h-4 w-4" />
                  </div>
                  <div className="leading-none">
                    <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-100">MeetingMind</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {view === "overview" ? "AI dashboard" : activeWorkspace.name}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
                {view === "overview" && (
                  <>
                    <Button
                      onClick={handleStartFreshMeeting}
                      className="rounded-2xl bg-[linear-gradient(135deg,#9b7bff_0%,#7d5cff_100%)] px-5 text-white shadow-[0_20px_40px_-22px_rgba(125,92,255,0.95)] hover:opacity-95"
                    >
                      New Meeting
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setView("upload")}
                      className="rounded-2xl border-white/70 bg-white/80 px-5 text-slate-700 shadow-[0_14px_34px_-28px_rgba(102,92,170,0.6)] dark:border-white/10 dark:bg-slate-900/75 dark:text-slate-200"
                    >
                      <Upload className="h-4 w-4" />
                      Upload Audio
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setView("reports")}
                      className="rounded-2xl border-white/70 bg-white/80 px-5 text-slate-700 shadow-[0_14px_34px_-28px_rgba(102,92,170,0.6)] dark:border-white/10 dark:bg-slate-900/75 dark:text-slate-200"
                    >
                      <Sparkles className="h-4 w-4" />
                      Generate Summary
                    </Button>
                  </>
                )}

                <StatusIndicator status={status} />
                <ThemeToggle />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-label="Open account menu"
                    >
                      <Avatar className="h-10 w-10 border border-white/80 shadow-[0_12px_28px_-20px_rgba(103,88,177,0.65)] dark:border-white/10">
                        <AvatarFallback className="bg-[linear-gradient(135deg,#7d5cff_0%,#4b78ff_100%)] text-xs font-bold text-white">
                          {user?.name?.[0]?.toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72 rounded-2xl border-white/70 bg-white/90 p-2 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/92">
                    <DropdownMenuLabel className="px-3 py-2">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">{user?.name || "MeetingMind User"}</p>
                        <p className="text-xs font-normal text-muted-foreground">{user?.email || "No email available"}</p>
                        <p className="text-xs font-normal text-muted-foreground">
                          Active workspace: {activeWorkspace.name}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setView("overview")} className="gap-2 rounded-xl px-3 py-2">
                      <UserCircle2 className="h-4 w-4" />
                      Overview
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView("upload")} className="gap-2 rounded-xl px-3 py-2">
                      <Upload className="h-4 w-4" />
                      Upload Media
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView("reports")} className="gap-2 rounded-xl px-3 py-2">
                      <FileText className="h-4 w-4" />
                      Reports
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handleCopyEmail()} className="gap-2 rounded-xl px-3 py-2">
                      <Copy className="h-4 w-4" />
                      Copy Email
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="gap-2 rounded-xl px-3 py-2 text-destructive focus:text-destructive">
                      <LogOut className="h-4 w-4" />
                      Log Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-auto relative">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute left-[-12%] top-[-4%] h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(125,92,255,0.18),transparent_65%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(125,92,255,0.2),transparent_60%)]" />
              <div className="absolute right-[-10%] top-[10%] h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(255,179,222,0.22),transparent_60%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(59,130,246,0.14),transparent_55%)]" />
              <div className="absolute bottom-[-8%] left-[24%] h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(140,190,255,0.16),transparent_62%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(236,72,153,0.12),transparent_58%)]" />
            </div>
            <div className={`relative px-4 py-5 md:px-6 ${view === "reports" || view === "calendar" ? "lg:px-8" : "lg:px-6"}`}>
            {view === "reports" && (
               <div className="max-w-7xl mx-auto w-full">
                 <ReportsView />
               </div>
            )}

            {view === "calendar" && (
               <div className="max-w-7xl mx-auto w-full h-full">
                 <CalendarView onSelect={() => setView("meeting")} />
               </div>
            )}

            {view === "overview" && <DashboardOverview onSelect={() => setView("meeting")} />}
            
            {view === "meeting" && (
              <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="font-heading text-2xl font-bold">
                      {currentMeeting ? currentMeeting.summary?.title || "Current Meeting" : "New Meeting"}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                      {currentMeeting ? `Started ${new Date(currentMeeting.date).toLocaleString()}` : "Record and transcribe your meeting in real-time"}
                    </p>
                  </div>
                  <RecordingControls />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <TranscriptViewer />
                  <SummaryPanel />
                </div>
              </div>
            )}

            {view === "history" && (
              <div className="w-full h-full pb-10">
                <NotesDashboard />
              </div>
            )}

            {view === "upload" && (
              <div className="max-w-3xl mx-auto">
                <h1 className="font-heading text-2xl font-bold mb-1">Upload Media</h1>
                <p className="text-sm text-muted-foreground mb-6">Upload an audio or video file to generate an AI summary</p>
                <FileUpload />
              </div>
            )}

            {view === "exports" && (
              <div className="max-w-3xl mx-auto">
                <ExportsView />
              </div>
            )}

            {["settings", "coaching", "recommendations", "analytics", "integrations"].includes(view) && (
              <div className="max-w-3xl mx-auto text-center py-20 flex flex-col justify-center items-center h-full">
                <h1 className="font-heading text-2xl font-bold mb-2 capitalize">{view.replace("-", " ")}</h1>
                <p className="text-muted-foreground">This feature will be available in a future update.</p>
              </div>
            )}
            
            {/* When Ask AI is clicked from sidebar */}
            {view === "ask-ai" && (
               <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-4 max-w-sm animate-in fade-in zoom-in-95 duration-500">
                     <div className="bg-[#8b5cf6]/10 h-20 w-20 rounded-full flex items-center justify-center mx-auto text-[#8b5cf6]">
                        <Brain className="h-10 w-10" />
                     </div>
                     <h2 className="text-2xl font-bold">MeetingMind AI Assistant</h2>
                     <p className="text-muted-foreground text-sm">Use the floating chat button on the bottom right to talk to my intelligent assistant while browsing your workspace!</p>
                  </div>
               </div>
            )}

            <ChatBot />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function Dashboard() {
  return (
    <MeetingProvider>
      <DashboardContent />
    </MeetingProvider>
  );
}
