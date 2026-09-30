import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listNotificationTemplates, revertNotificationTemplate, updateNotificationTemplate } from "@/api/admin";
import type { ConfigScopeParams, NotificationTemplateDto } from "@/api/admin";
import { ConfigScopePicker } from "@/components/admin/ConfigScopePicker";
import { errorMessage } from "@/lib/api-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

function TemplateRow({ template, dealershipId }: { template: NotificationTemplateDto; dealershipId?: string }) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = React.useState(template.subject ?? "");
  const [note, setNote] = React.useState(template.note ?? "");

  const saveMutation = useMutation({
    mutationFn: () => updateNotificationTemplate(template.key, { subject: subject.trim() || undefined, note: note.trim() || undefined }, dealershipId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-templates"] }),
  });

  const revertMutation = useMutation({
    mutationFn: () => revertNotificationTemplate(template.key, dealershipId),
    onSuccess: () => {
      setSubject("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">{template.label}</CardTitle>
          <CardDescription>Default: {template.defaultSubject}</CardDescription>
          {!template.isCustomized && template.inherited && (
            <p className="mt-1 text-xs text-muted-foreground">
              Using the company-wide version{template.inherited.subject ? `: "${template.inherited.subject}"` : ""}
              {template.inherited.note ? " (with a note)" : ""}.
            </p>
          )}
        </div>
        {template.isCustomized && <Badge variant="accent">Customized</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`subject-${template.key}`}>Custom Subject Line</Label>
          <Input
            id={`subject-${template.key}`}
            placeholder={template.inherited?.subject ?? template.defaultSubject}
            maxLength={255}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`note-${template.key}`}>Highlighted Note (optional)</Label>
          <textarea
            id={`note-${template.key}`}
            className="flex min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder={template.inherited?.note ?? "A promo, policy note, or reminder shown near the top of this email."}
            maxLength={4000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || (!subject.trim() && !note.trim())}>
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
          {template.isCustomized && (
            <Button size="sm" variant="outline" onClick={() => revertMutation.mutate()} disabled={revertMutation.isPending}>
              Revert to Default
            </Button>
          )}
        </div>
        {(saveMutation.isError || revertMutation.isError) && (
          <p className="text-sm text-destructive">{errorMessage(saveMutation.error ?? revertMutation.error)}</p>
        )}
        {template.updatedAt && (
          <p className="text-xs text-muted-foreground">Last updated {new Date(template.updatedAt).toLocaleString("en-IN")}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminNotificationTemplatesPage() {
  const [scope, setScope] = React.useState<ConfigScopeParams | null>(null);
  const dealershipId = scope?.dealershipId;
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["notification-templates", dealershipId ?? null],
    queryFn: () => listNotificationTemplates(dealershipId),
    enabled: scope !== null,
  });

  return (
    <div className="px-4 py-6 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Notification Templates</h1>
        <p className="text-sm text-muted-foreground">
          Customize the subject line and add a highlighted note to any transactional email — changes apply immediately, no deployment needed.
          A dealership's version replaces the company-wide one for its customers.
        </p>
      </div>

      <div className="mb-6 max-w-xl">
        <ConfigScopePicker value={scope} onChange={setScope} />
      </div>

      {scope && isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}
      {isError && <p className="text-destructive">{errorMessage(error) ?? "Couldn't load notification templates."}</p>}

      <div className="space-y-3">
        {data?.map((template) => (
          <TemplateRow key={`${dealershipId ?? "company"}:${template.key}`} template={template} dealershipId={dealershipId} />
        ))}
      </div>
    </div>
  );
}
