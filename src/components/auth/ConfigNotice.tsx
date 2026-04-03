type ConfigNoticeProps = {
  message: string | null;
};

export function ConfigNotice({ message }: ConfigNoticeProps) {
  if (!message) return null;

  return (
    <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      {message}
    </div>
  );
}
