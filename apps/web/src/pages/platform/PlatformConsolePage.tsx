import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { KeyRound, LogOut, RefreshCw, Server, Trash2 } from "lucide-react";
import {
  deletePlatformOrganization,
  hasPlatformSession,
  listPlatformOrganizations,
  platformLogin,
  platformLogout,
  reconnectPlatformOrganization,
  type PlatformOrganization,
} from "@/api/platform";
import type { OrganizationConnectionStatus } from "@/api/onboarding";
import { errorMessage } from "@/lib/api-error";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyableField } from "@/components/ui/copyable-field";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";

const SESSION_KEY = ["platform-session"];
const ORGANIZATIONS_KEY = ["platform-organizations"];

const STATUS_BADGE: Record<OrganizationConnectionStatus, { label: string; variant: BadgeProps["variant"] }> = {
  connected: { label: "Connected", variant: "success" },
  pending: { label: "Not connected", variant: "warning" },
  error: { label: "Connection error", variant: "destructive" },
};

/** Cross-tenant operator console: reached only by its address and the operator password. */
export function PlatformConsolePage() {
  const session = useQuery({ queryKey: SESSION_KEY, queryFn: hasPlatformSession, retry: false });

  if (session.isLoading) return <CenteredMessage>Loading…</CenteredMessage>;
  if (session.isError) return <CenteredMessage>This page isn't available.</CenteredMessage>;
  return session.data ? <OrganizationsConsole /> : <OperatorLogin />;
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function OperatorLogin() {
  const queryClient = useQueryClient();
  const [password, setPassword] = React.useState("");
  const login = useMutation({
    mutationFn: () => platformLogin(password),
    onSuccess: () => {
      setPassword("");
      queryClient.setQueryData(SESSION_KEY, true);
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <KeyRound className="mb-2 h-8 w-8 text-primary" />
          <CardTitle>Platform operator</CardTitle>
          <CardDescription>Manage the companies connected to this platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (password) login.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="operator-password">Password</Label>
              <Input
                id="operator-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={256}
                aria-invalid={login.isError}
              />
              {login.isError && (
                <p role="alert" className="text-xs text-destructive">
                  {errorMessage(login.error)}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={!password || login.isPending}>
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function OrganizationsConsole() {
  const queryClient = useQueryClient();
  const organizations = useQuery({ queryKey: ORGANIZATIONS_KEY, queryFn: listPlatformOrganizations });
  const [reconnecting, setReconnecting] = React.useState<PlatformOrganization | null>(null);
  const [deleting, setDeleting] = React.useState<PlatformOrganization | null>(null);

  // The session is short-lived; once it lapses, go back to the password form.
  React.useEffect(() => {
    if (isAxiosError(organizations.error) && organizations.error.response?.status === 401) {
      queryClient.setQueryData(SESSION_KEY, false);
    }
  }, [organizations.error, queryClient]);

  const logout = useMutation({
    mutationFn: platformLogout,
    onSettled: () => {
      queryClient.removeQueries({ queryKey: ORGANIZATIONS_KEY });
      queryClient.setQueryData(SESSION_KEY, false);
    },
  });

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Server className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Connected organizations</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </header>

        {organizations.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {organizations.isError && (
          <QueryError
            error={organizations.error}
            subject="the organizations"
            onRetry={() => organizations.refetch()}
            isRetrying={organizations.isFetching}
          />
        )}
        {organizations.data?.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">No organizations yet.</CardContent>
          </Card>
        )}
        {organizations.data?.map((org) => (
          <OrganizationRow key={org.id} org={org} onReconnect={() => setReconnecting(org)} onDelete={() => setDeleting(org)} />
        ))}
      </div>

      {reconnecting && <ReconnectDialog org={reconnecting} onClose={() => setReconnecting(null)} />}
      {deleting && <DeleteDialog org={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function OrganizationRow({ org, onReconnect, onDelete }: { org: PlatformOrganization; onReconnect: () => void; onDelete: () => void }) {
  const status = STATUS_BADGE[org.connectionStatus];
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{org.name}</p>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{org.slug}</span>
            {org.sfOrgId && <> · Salesforce org <span className="font-mono">{org.sfOrgId}</span></>}
          </p>
          {org.sfInstanceUrl && <p className="break-all text-xs text-muted-foreground">{org.sfInstanceUrl}</p>}
          {org.connectionError && <p className="break-words text-xs text-destructive">{org.connectionError}</p>}
          <p className="text-xs text-muted-foreground">Created {new Date(org.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={onReconnect}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reconnect
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReconnectDialog({ org, onClose }: { org: PlatformOrganization; onClose: () => void }) {
  const queryClient = useQueryClient();
  const reconnect = useMutation({
    mutationFn: () => reconnectPlatformOrganization(org.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_KEY }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle>Reconnect {org.name}?</DialogTitle>
        <DialogDescription>
          {reconnect.data
            ? "Open this link to run the Salesforce connection again. It works until the setup is finished or another link is issued — share it only with the company's Salesforce admin."
            : "This disconnects its Salesforce org now and signs out its staff. You'll get a one-time setup link to connect the same org again."}
        </DialogDescription>
      </DialogHeader>
      {reconnect.data && <CopyableField label="Setup link" value={reconnect.data.setupUrl} />}
      {reconnect.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(reconnect.error)}
        </p>
      )}
      <DialogFooter>
        {reconnect.data ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => reconnect.mutate()} disabled={reconnect.isPending}>
              {reconnect.isPending ? "Disconnecting…" : "Disconnect and get link"}
            </Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  );
}

function DeleteDialog({ org, onClose }: { org: PlatformOrganization; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [confirmSlug, setConfirmSlug] = React.useState("");
  const matches = confirmSlug.trim().toLowerCase() === org.slug;
  const remove = useMutation({
    mutationFn: () => deletePlatformOrganization(org.id, confirmSlug.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_KEY });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle>Delete {org.name}?</DialogTitle>
        <DialogDescription>
          This permanently removes the company from the platform — its connection, staff accounts, addresses and audit log.
          Its data in Salesforce is not touched. This can't be undone.
        </DialogDescription>
      </DialogHeader>
      <form
        noValidate
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (matches) remove.mutate();
        }}
      >
        <Label htmlFor="confirm-slug">
          Type <span className="font-mono">{org.slug}</span> to confirm
        </Label>
        <Input
          id="confirm-slug"
          value={confirmSlug}
          onChange={(e) => setConfirmSlug(e.target.value)}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
        />
        {remove.isError && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(remove.error)}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={!matches || remove.isPending}>
            {remove.isPending ? "Deleting…" : "Delete organization"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
