import { useId, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { normalizeEmail, getAuthenticatedSession } from "@/lib/auth";
import { sendExportEmail } from "@/lib/exportEmail";
import type { ReportExportFormat } from "@/lib/reportExport";
import { useToast } from "@/hooks/use-toast";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ReportEmailButtonProps = {
  title: string;
  reportText: string;
  visualSection?: string;
  triggerLabel?: string;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  buttonClassName?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ReportEmailButton({
  title,
  reportText,
  visualSection,
  triggerLabel = "Email",
  triggerVariant = "outline",
  triggerSize = "sm",
  buttonClassName,
}: ReportEmailButtonProps) {
  const session = getAuthenticatedSession();
  const [open, setOpen] = useState(false);
  const [toEmail, setToEmail] = useState(session?.email ?? "");
  const [format, setFormat] = useState<ReportExportFormat>("pdf");
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();
  const emailInputId = useId();
  const hasContent = Boolean(title.trim() && reportText.trim());

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (nextOpen && !toEmail && session?.email) {
      setToEmail(session.email);
    }
  };

  const handleSend = async () => {
    if (!hasContent) return;

    const recipientEmail = normalizeEmail(toEmail);

    if (!EMAIL_PATTERN.test(recipientEmail)) {
      toast({
        title: "Enter a valid email",
        description: "Please add a valid recipient address before sending the export.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    try {
      const result = await sendExportEmail({
        toEmail: recipientEmail,
        title,
        reportText,
        format,
        visualSection,
      });

      toast({
        title: "Export emailed",
        description: result.message || `${result.fileName} was sent to ${result.toEmail}.`,
      });
      setOpen(false);
    } catch (error: unknown) {
      toast({
        title: "Could not send export",
        description: error instanceof Error ? error.message : "The export email could not be delivered.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant={triggerVariant}
          size={triggerSize}
          className={buttonClassName}
          disabled={!hasContent}
        >
          <Mail className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl border-border/60">
        <DialogHeader>
          <DialogTitle>Email Export</DialogTitle>
          <DialogDescription>
            Send this generated report as a PDF or DOCX attachment.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={emailInputId}>Recipient email</Label>
            <Input
              id={emailInputId}
              type="email"
              value={toEmail}
              onChange={(event) => setToEmail(event.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
            />
            <p className="text-xs text-muted-foreground">
              Your signed-in email is used as the default when it is available.
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Format</Label>
            <Select value={format} onValueChange={(value) => setFormat(value as ReportExportFormat)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="docx">DOCX</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            The attachment will be generated from the current report for <span className="font-medium text-foreground">{title}</span>.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSend()} disabled={isSending || !hasContent}>
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {isSending ? "Sending..." : "Send export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
