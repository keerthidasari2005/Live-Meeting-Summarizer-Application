import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";
import { getAuthenticatedSession } from "@/lib/auth";

export function ProtectedRoute({ children }: PropsWithChildren) {
  if (!getAuthenticatedSession()) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
