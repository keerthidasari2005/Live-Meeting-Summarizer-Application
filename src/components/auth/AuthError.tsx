type AuthErrorProps = {
  error: string;
};

export function AuthError({ error }: AuthErrorProps) {
  if (!error) return null;

  return <p className="text-sm text-red-400 text-center font-medium animate-pulse mt-2">{error}</p>;
}
