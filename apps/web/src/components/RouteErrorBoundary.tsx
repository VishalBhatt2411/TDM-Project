import * as React from "react";
import { Button } from "@/components/ui/button";

interface State {
  error: Error | null;
}

/**
 * Keeps a page that throws while rendering from blanking the whole app — the navigation stays
 * usable and the page can be retried. Mount it with `key={pathname}` so leaving the page resets it.
 */
export class RouteErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(JSON.stringify({ event: "page_render_failed", message: error.message }), info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <h2 className="text-lg font-semibold">This page couldn't be displayed</h2>
        <p className="text-sm text-muted-foreground">Something went wrong while showing it. Try again, or open another section.</p>
        <Button variant="outline" onClick={() => this.setState({ error: null })}>
          Try again
        </Button>
      </div>
    );
  }
}
