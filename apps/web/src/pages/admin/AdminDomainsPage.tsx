import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import {
  addCompanyDomain,
  listCustomDomains,
  removeCompanyDomain,
  setDealershipDomain,
  verifyCustomDomain,
} from "@/api/admin";
import type { CustomDomainDto, CustomDomainStatus, SiteDomainsDto } from "@/api/admin";
import { errorMessage } from "@/lib/api-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyableField } from "@/components/ui/copyable-field";
import { Input } from "@/components/ui/input";

/** Client-side shape check only — the server decides what may be claimed. */
const HOSTNAME_PATTERN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

const STATUS: Record<CustomDomainStatus, { label: string; variant: "success" | "warning" | "destructive" }> = {
  live: { label: "Live", variant: "success" },
  pending: { label: "Awaiting DNS", variant: "warning" },
  conflict: { label: "Used by another site", variant: "destructive" },
};

const QUERY_KEY = ["custom-domains"];

export function AdminDomainsPage() {
  const { data, isLoading, isError, error } = useQuery({ queryKey: QUERY_KEY, queryFn: listCustomDomains });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Domains</h1>
        <p className="text-sm text-muted-foreground">
          Serve a customer site from your own domain. A domain goes live once its DNS publishes the verification record shown below.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}
      {isError && <p className="text-destructive">{errorMessage(error) ?? "Couldn't load domains."}</p>}
      {data && data.sites.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <Globe className="mx-auto mb-3 h-8 w-8" />
          No sites you can manage domains for.
        </div>
      )}

      <div className="space-y-4">
        {data?.sites.map((site) => (
          <SiteCard key={site.dealershipId ?? "company"} site={site} target={data.target} />
        ))}
      </div>
    </div>
  );
}

function SiteCard({ site, target }: { site: SiteDomainsDto; target: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState("");
  const [notice, setNotice] = React.useState<string | null>(null);
  const isCompany = site.dealershipId === null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const add = useMutation({
    mutationFn: async (hostname: string): Promise<void> => {
      if (isCompany) await addCompanyDomain(hostname);
      else await setDealershipDomain(site.dealershipId!, hostname);
    },
    onSuccess: () => {
      setDraft("");
      setNotice("Domain saved. Publish the DNS records below, then verify.");
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (hostname: string) =>
      isCompany ? removeCompanyDomain(hostname) : setDealershipDomain(site.dealershipId!, null),
    onSuccess: () => {
      setNotice("Domain removed.");
      return refresh();
    },
  });
  const verify = useMutation({
    mutationFn: (hostname: string) => verifyCustomDomain(hostname, site.dealershipId),
    onSuccess: (result) => {
      setNotice(
        result.status === "live"
          ? `${result.hostname} is live.`
          : result.status === "conflict"
            ? `${result.hostname} is already used by another of your sites.`
            : `The verification record for ${result.hostname} wasn't found yet. DNS changes can take a while to spread.`,
      );
      return refresh();
    },
  });

  const trimmed = draft.trim().toLowerCase();
  const draftInvalid = trimmed.length > 0 && !HOSTNAME_PATTERN.test(trimmed);
  const isBusy = add.isPending || remove.isPending || verify.isPending;
  const mutationError = errorMessage(add.error ?? remove.error ?? verify.error);
  // A dealership has one custom domain; entering another replaces it.
  const canAdd = isCompany || site.customDomains.length === 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed || draftInvalid) return;
    setNotice(null);
    add.mutate(trimmed);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{site.name}</CardTitle>
          {isCompany && <Badge variant="secondary">Company-wide</Badge>}
        </div>
        <CardDescription>
          {site.platformHost ? (
            <>
              Platform address: <span className="font-mono">{site.platformHost}</span>
            </>
          ) : (
            "No platform address — set this dealership's URL slug first."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {site.customDomains.length === 0 && <p className="text-sm text-muted-foreground">No custom domain yet.</p>}
        {site.customDomains.map((domain) => (
          <DomainRow
            key={domain.hostname}
            domain={domain}
            target={target}
            disabled={isBusy}
            onVerify={() => {
              setNotice(null);
              verify.mutate(domain.hostname);
            }}
            onRemove={() => {
              if (!window.confirm(`Stop serving this site from ${domain.hostname}?`)) return;
              setNotice(null);
              remove.mutate(domain.hostname);
            }}
          />
        ))}

        {canAdd && (
          <form onSubmit={submit} className="space-y-1">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="drive.example.com"
                aria-label={`Custom domain for ${site.name}`}
                aria-invalid={draftInvalid}
                maxLength={253}
                disabled={isBusy}
              />
              <Button type="submit" disabled={isBusy || !trimmed || draftInvalid} className="shrink-0">
                {add.isPending ? "Saving…" : "Add domain"}
              </Button>
            </div>
            {draftInvalid && <p className="text-xs text-destructive">Enter a bare host name, like drive.example.com.</p>}
          </form>
        )}

        {notice && !mutationError && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
        {mutationError && <p className="text-sm text-destructive">{mutationError}</p>}
      </CardContent>
    </Card>
  );
}

function DomainRow({
  domain,
  target,
  disabled,
  onVerify,
  onRemove,
}: {
  domain: CustomDomainDto;
  target: string;
  disabled: boolean;
  onVerify: () => void;
  onRemove: () => void;
}) {
  const status = STATUS[domain.status];
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-sm">{domain.hostname}</span>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <div className="flex gap-2">
          {domain.status !== "live" && (
            <Button size="sm" variant="outline" disabled={disabled} onClick={onVerify}>
              Verify now
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={disabled} onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
      {domain.verification && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Add these records at your DNS provider:</p>
          <CopyableField label={`CNAME — ${domain.hostname} points to`} value={target} />
          <CopyableField label={`TXT — name`} value={domain.verification.name} />
          <CopyableField label="TXT — value" value={domain.verification.value} />
        </div>
      )}
    </div>
  );
}
