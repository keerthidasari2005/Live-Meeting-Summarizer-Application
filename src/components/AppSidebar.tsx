import { useState } from "react";
import {
  LayoutDashboard,
  Calendar,
  FileText,
  Lightbulb,
  BarChart2,
  Plus,
  Bell,
  Brain,
  LogOut,
  Upload,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useMeetingStore } from "@/hooks/useMeetingStore";
import type { DashboardView } from "@/types/dashboard";

const mainNavItems = [
  { title: "Dashboard", icon: LayoutDashboard, view: "overview" as const },
  { title: "Meetings", icon: Lightbulb, view: "meeting" as const },
  { title: "Upload Media", icon: Upload, view: "upload" as const },
  { title: "Calendar", icon: Calendar, view: "calendar" as const },
  { title: "Reports", icon: BarChart2, view: "reports" as const },
  { title: "Notes", icon: FileText, view: "history" as const },
];

interface AppSidebarProps {
  currentView: DashboardView;
  onViewChange: (view: DashboardView) => void;
  onLogout?: () => void;
}

function formatNotificationTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Just now";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AppSidebar({ currentView, onViewChange, onLogout }: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { toast } = useToast();
  const {
    meetings,
    allMeetings,
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    notifications,
    unreadNotificationCount,
    setActiveWorkspace,
    createWorkspace,
    markAllNotificationsRead,
  } = useMeetingStore();
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");

  const handleCreateWorkspace = () => {
    const created = createWorkspace(workspaceName);
    if (!created) {
      toast({
        title: "Workspace name required",
        description: "Give the workspace a short name so it is easy to switch to later.",
        variant: "destructive",
      });
      return;
    }

    setWorkspaceName("");
    setWorkspaceDialogOpen(false);
    onViewChange("overview");
    toast({
      title: "Workspace created",
      description: `${created.name} is now active and ready for new meetings or uploads.`,
    });
  };

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="border-r border-white/60 bg-white/40 text-foreground backdrop-blur-2xl shadow-[inset_-1px_0_0_rgba(255,255,255,0.55)] group-data-[side=left]:bg-white/40 dark:border-white/10 dark:bg-slate-950/45 dark:shadow-[inset_-1px_0_0_rgba(255,255,255,0.08)] dark:group-data-[side=left]:bg-slate-950/45"
      >
        <SidebarContent className="bg-[linear-gradient(180deg,rgba(255,255,255,0.78)_0%,rgba(245,242,255,0.88)_48%,rgba(238,234,255,0.94)_100%)] dark:bg-[linear-gradient(180deg,rgba(9,9,16,0.86)_0%,rgba(17,24,39,0.92)_52%,rgba(15,23,42,0.96)_100%)]">
          <SidebarGroup className="pt-2">
            {!collapsed && (
              <div className="mb-2 flex items-center justify-between px-4 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#9b7bff_0%,#7d5cff_100%)] text-white shadow-[0_18px_36px_-22px_rgba(125,92,255,0.95)]">
                    <Brain className="h-5 w-5" />
                  </div>
                  <span className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">MeetingMind</span>
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Open notifications"
                    >
                      <Bell className="h-5 w-5" />
                      {unreadNotificationCount > 0 && (
                        <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" />
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 rounded-3xl border-white/80 bg-white/92 p-0 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/92">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold">Notifications</p>
                        <p className="text-xs text-muted-foreground">
                          {unreadNotificationCount > 0
                            ? `${unreadNotificationCount} unread update${unreadNotificationCount === 1 ? "" : "s"}`
                            : "Everything is up to date"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={markAllNotificationsRead}
                        disabled={unreadNotificationCount === 0}
                        className="h-8 px-2 text-xs"
                      >
                        Mark all read
                      </Button>
                    </div>

                    <div className="max-h-[360px] overflow-y-auto p-2">
                      {notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className="rounded-xl border border-transparent px-3 py-3 transition-colors hover:border-border hover:bg-muted/40"
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`mt-1.5 h-2.5 w-2.5 rounded-full ${
                                notification.read ? "bg-muted-foreground/30" : "bg-primary"
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium leading-5">{notification.title}</p>
                                {!notification.read && <Badge className="shrink-0 px-2 py-0 text-[10px]">New</Badge>}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{notification.description}</p>
                              <p className="mt-2 text-[11px] text-muted-foreground/80">
                                {formatNotificationTime(notification.createdAt)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {!collapsed && (
              <div className="mb-6 px-4">
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center justify-between rounded-[22px] border border-white/80 bg-white/78 px-3 py-3 text-left text-muted-foreground shadow-[0_22px_40px_-34px_rgba(111,88,196,0.85)] transition-colors hover:bg-white hover:text-foreground dark:border-white/10 dark:bg-slate-900/78 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(125,92,255,0.12),rgba(74,119,255,0.14))] text-primary">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground dark:text-slate-100">{activeWorkspace.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {meetings.length} workspace meeting{meetings.length === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72 rounded-2xl border-white/80 bg-white/92 p-1 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/92">
                      <DropdownMenuLabel>Switch Workspace</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {workspaces.map((workspace) => {
                        const isActive = workspace.id === activeWorkspaceId;
                        const workspaceMeetingCount = allMeetings.filter(
                          (meeting) => (meeting.workspaceId || "workspace-default") === workspace.id,
                        ).length;

                        return (
                          <DropdownMenuItem
                            key={workspace.id}
                            onClick={() => {
                              setActiveWorkspace(workspace.id);
                              onViewChange("overview");
                            }}
                            className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{workspace.name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {workspaceMeetingCount} meeting{workspaceMeetingCount === 1 ? "" : "s"}
                              </p>
                            </div>
                            {isActive && <Check className="h-4 w-4 text-primary" />}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 shrink-0 rounded-[22px] border-white/80 bg-white/80 shadow-[0_18px_38px_-30px_rgba(111,88,196,0.9)] dark:border-white/10 dark:bg-slate-900/80"
                      onClick={() => setWorkspaceDialogOpen(true)}
                      aria-label="Create workspace"
                    >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <SidebarGroupContent>
              <SidebarMenu className="gap-2 px-2">
                {mainNavItems.map((item) => {
                  const isActive = currentView === item.view;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => onViewChange(item.view)}
                        className={`mr-2 rounded-2xl px-3 py-6 transition-all ${
                          isActive
                            ? "bg-[linear-gradient(90deg,rgba(139,92,246,0.16),rgba(139,92,246,0.06))] text-primary shadow-[0_18px_34px_-30px_rgba(125,92,255,0.9)] ring-1 ring-white/70 dark:ring-white/10"
                            : "text-muted-foreground hover:bg-white/65 hover:text-foreground dark:hover:bg-white/10 dark:hover:text-slate-100"
                        }`}
                      >
                        <item.icon className={`h-[18px] w-[18px] ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        {!collapsed && (
                          <span className={`text-[15px] font-medium ${isActive ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                            {item.title}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {onLogout && (
          <SidebarFooter className="bg-transparent px-4 pb-5 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onLogout}
              className="w-full justify-start gap-2 rounded-2xl border border-white/70 bg-white/68 py-6 text-muted-foreground shadow-[0_18px_34px_-32px_rgba(111,88,196,0.8)] hover:bg-white hover:text-foreground dark:border-white/10 dark:bg-slate-900/70 dark:hover:bg-slate-900 dark:hover:text-slate-100"
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Log Out</span>}
            </Button>
          </SidebarFooter>
        )}
      </Sidebar>

      <Dialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl border-border/70">
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
            <DialogDescription>
              Separate recordings, uploads, and reports into focused workspaces for different teams or clients.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleCreateWorkspace();
                }
              }}
              placeholder="Product Sprint, Client Alpha, Design Reviews..."
              autoFocus
            />

            <div className="flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Active workspace right now</span>
              <span className="font-medium text-foreground">{activeWorkspace.name}</span>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setWorkspaceDialogOpen(false);
                  setWorkspaceName("");
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleCreateWorkspace}>
                Create Workspace
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
