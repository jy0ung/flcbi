import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "We could not load this data right now. Please try again.";
}

interface QueryErrorStateProps {
  title?: string;
  error: unknown;
  onRetry?: () => void;
}

export function QueryErrorState({
  title = "Something went wrong",
  error,
  onRetry,
}: QueryErrorStateProps) {
  return (
    <div className="glass-panel p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-destructive/10 p-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </div>
        <div className="space-y-2">
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-sm text-muted-foreground">{getErrorMessage(error)}</p>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
