import { AlertCircle } from "lucide-react";
import { errorMessage } from "@/lib/api-error";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QueryErrorProps {
  error: unknown;
  /** What failed to load, e.g. "your bookings". */
  subject: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

/** The failed state of a data-loading screen: what didn't load, the server's reason, and a retry. */
export function QueryError({ error, subject, onRetry, isRetrying, className }: QueryErrorProps) {
  return (
    <div role="alert" className={cn("rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center", className)}>
      <AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive" />
      <p className="font-medium">Couldn't load {subject}.</p>
      <p className="mt-1 text-sm text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-4" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? "Retrying…" : "Try again"}
        </Button>
      )}
    </div>
  );
}
