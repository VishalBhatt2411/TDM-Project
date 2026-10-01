import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Car, Check, ImageUp, RotateCcw, TriangleAlert, X } from "lucide-react";
import { getBranding, saveBranding, uploadBrandImage } from "@/api/admin";
import type { BrandImageKind, BrandLayerDto, BrandingEditorDto, BrandingFieldsDto, ConfigScopeParams } from "@/api/admin";
import { brandAssetUrl } from "@/api/config";
import { ConfigScopePicker } from "@/components/admin/ConfigScopePicker";
import { RegionalSettingsCard } from "@/components/admin/RegionalSettingsCard";
import { BookingScheduleCard } from "@/components/admin/BookingScheduleCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { errorMessage } from "@/lib/api-error";
import { blobToBase64, prepareImageForUpload } from "@/lib/image-upload";
import { heroBackground, heroTextContrast } from "@/lib/brand-hero";
import { WCAG_AA_LARGE, WCAG_AA_NORMAL, WHITE, contrastRatio, hexToRgb, isHexColor, readableOn } from "@/lib/color";
import { cn } from "@/lib/utils";

type TextFieldKey = Exclude<keyof BrandingFieldsDto, "logoUrl" | "primaryColorHex">;
type SectionChoice = "inherit" | "show" | "hide";
type Schema = BrandingEditorDto["schema"];

interface BrandForm {
  branding: Record<keyof BrandingFieldsDto, string>;
  logoAssetId: string;
  heroImageUrl: string;
  heroImageAssetId: string;
  sections: Record<string, SectionChoice>;
  copy: Record<string, Record<string, string>>;
}

const TEXT_FIELDS: { key: TextFieldKey; label: string; type?: string; multiline?: boolean }[] = [
  { key: "logoText", label: "Logo text" },
  { key: "tagline", label: "Tagline" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "email", label: "Email", type: "email" },
  { key: "address", label: "Address", multiline: true },
  { key: "operatingHours", label: "Opening hours", multiline: true },
];
const BRANDING_KEYS: (keyof BrandingFieldsDto)[] = [...TEXT_FIELDS.map((f) => f.key), "logoUrl", "primaryColorHex"];

/** Admin labels for the server's copy keys and sections; an unknown key shows as itself. */
const COPY_LABELS: Record<string, string> = {
  heroTitle: "Hero title",
  heroSubtitle: "Hero subtitle",
  feature1Title: "Feature 1 title",
  feature1Body: "Feature 1 text",
  feature2Title: "Feature 2 title",
  feature2Body: "Feature 2 text",
  feature3Title: "Feature 3 title",
  feature3Body: "Feature 3 text",
  ctaTitle: "Closing call-to-action title",
  ctaSubtitle: "Closing call-to-action text",
};
const SECTION_LABELS: Record<string, string> = {
  featured: "Featured vehicles",
  bestSellers: "Best sellers",
  newLaunches: "New launches",
};
/** Copy longer than this gets a multi-line box. */
const MULTILINE_COPY_LENGTH = 150;
const HTTPS_URL = /^https:\/\/[^\s"'<>]+$/;
const TEXTAREA_CLASS =
  "flex min-h-[4.5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const SELECT_CLASS = "flex h-9 rounded-md border border-input bg-background px-2 text-sm";

function toForm(layer: BrandLayerDto, schema: Schema): BrandForm {
  const { branding, content } = layer;
  return {
    branding: Object.fromEntries(BRANDING_KEYS.map((k) => [k, branding[k] ?? ""])) as BrandForm["branding"],
    logoAssetId: content.logoAssetId ?? "",
    heroImageUrl: content.heroImageUrl ?? "",
    heroImageAssetId: content.heroImageAssetId ?? "",
    sections: Object.fromEntries(
      schema.sectionKeys.map((k) => {
        const shown = content.sections?.[k];
        return [k, shown === undefined ? "inherit" : shown ? "show" : "hide"];
      }),
    ),
    copy: Object.fromEntries(
      SUPPORTED_LANGUAGES.map(({ code }) => [
        code,
        Object.fromEntries(Object.keys(schema.copyMaxLength).map((k) => [k, content.copy?.[code]?.[k] ?? ""])),
      ]),
    ),
  };
}

/** The layer to save: blanks dropped, so they inherit. Key order is fixed, so two equal forms serialize identically. */
function toLayer(form: BrandForm): BrandLayerDto {
  const branding: BrandingFieldsDto = {};
  for (const key of BRANDING_KEYS) {
    const value = form.branding[key].trim();
    if (value) branding[key] = value;
  }
  const sections: Record<string, boolean> = {};
  for (const [key, choice] of Object.entries(form.sections)) if (choice !== "inherit") sections[key] = choice === "show";
  const copy: Record<string, Record<string, string>> = {};
  for (const [language, fields] of Object.entries(form.copy)) {
    const set = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    if (Object.keys(set).length > 0) copy[language] = set;
  }
  return {
    branding,
    content: {
      ...(form.logoAssetId ? { logoAssetId: form.logoAssetId } : {}),
      ...(form.heroImageUrl.trim() ? { heroImageUrl: form.heroImageUrl.trim() } : {}),
      ...(form.heroImageAssetId ? { heroImageAssetId: form.heroImageAssetId } : {}),
      ...(Object.keys(sections).length > 0 ? { sections } : {}),
      ...(Object.keys(copy).length > 0 ? { copy } : {}),
    },
  };
}

/** Field problems the server would reject, so Save can explain them before a round trip. */
function validate(form: BrandForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const color = form.branding.primaryColorHex.trim();
  if (color && !isHexColor(color)) errors.primaryColorHex = "Use a 6-digit hex colour such as #1A73E8.";
  const logoUrl = form.branding.logoUrl.trim();
  if (logoUrl && !HTTPS_URL.test(logoUrl)) errors.logoUrl = "The logo URL must start with https://.";
  const heroUrl = form.heroImageUrl.trim();
  if (heroUrl && !HTTPS_URL.test(heroUrl)) errors.heroImageUrl = "The hero image URL must start with https://.";
  const email = form.branding.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  return errors;
}

function imageUrl(url: string | undefined, assetId: string | undefined): string | undefined {
  return assetId ? brandAssetUrl(assetId) : url || undefined;
}

/** Longest edge per image kind: a logo renders small, a hero spans a wide screen. */
const MAX_IMAGE_DIMENSION: Record<BrandImageKind, number> = { logo: 1024, hero: 2560 };

function formatMegabytes(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/** "image/png", "image/jpeg" → "PNG or JPEG". */
function formatList(contentTypes: string[]): string {
  const names = contentTypes.map((type) => type.replace(/^image\//, "").toUpperCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : (names[0] ?? "");
}

function ResetButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={onClick} disabled={disabled}>
      <RotateCcw className="h-3 w-3" /> {label}
    </Button>
  );
}

function FieldRow({
  id,
  label,
  error,
  isSet,
  resetLabel,
  onReset,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  isSet: boolean;
  resetLabel: string;
  onReset: () => void;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {isSet && <ResetButton label={resetLabel} onClick={onReset} />}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function ContrastRow({ label, ratio, minimum }: { label: string; ratio: number; minimum: number }) {
  const passes = ratio >= minimum;
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0">{label}</span>
      <span className={cn("flex shrink-0 items-center gap-1 font-medium", passes ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
        {passes ? <Check className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
        {ratio.toFixed(1)}:1
      </span>
    </li>
  );
}

function ImageField({
  kind,
  label,
  url,
  assetId,
  inheritedUrl,
  inheritedLabel,
  urlError,
  schema,
  scope,
  onChange,
}: {
  kind: BrandImageKind;
  label: string;
  url: string;
  assetId: string;
  inheritedUrl?: string;
  inheritedLabel: string;
  urlError?: string;
  schema: Schema;
  scope: ConfigScopeParams;
  onChange: (next: { url: string; assetId: string }) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = React.useState<string>();
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const image = await prepareImageForUpload(file, { maxBytes, maxDimension: MAX_IMAGE_DIMENSION[kind] });
      return uploadBrandImage(scope, { kind, contentType: image.contentType, dataBase64: await blobToBase64(image.blob) });
    },
    onSuccess: ({ assetId: uploaded }) => onChange({ url: "", assetId: uploaded }),
  });
  const maxBytes = schema.maxImageBytes[kind];
  const contentTypes = schema.imageContentTypes[kind];
  const formats = formatList(contentTypes);

  const onFile = (file: File | undefined) => {
    setFileError(undefined);
    upload.reset();
    if (!file) return;
    if (!contentTypes.includes(file.type)) setFileError(`Use a ${formats} image.`);
    else upload.mutate(file);
  };

  const preview = imageUrl(url, assetId);
  const id = `brand-${kind}-url`;
  return (
    <FieldRow
      id={id}
      label={label}
      error={urlError ?? fileError ?? errorMessage(upload.error)}
      isSet={!!(url || assetId)}
      resetLabel="Remove"
      onReset={() => onChange({ url: "", assetId: "" })}
      hint={`An https:// link, or upload a ${formats}; images over ${formatMegabytes(maxBytes)} are resized automatically.`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {preview || inheritedUrl ? (
            <img src={preview ?? inheritedUrl} alt="" className={cn("h-full w-full object-contain", !preview && "opacity-50")} />
          ) : (
            <ImageUp className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {assetId ? (
            <p className="flex h-10 items-center text-sm text-muted-foreground">Uploaded image</p>
          ) : (
            <Input
              id={id}
              type="url"
              inputMode="url"
              placeholder={inheritedUrl ? inheritedLabel : "https://"}
              value={url}
              onChange={(e) => onChange({ url: e.target.value, assetId: "" })}
            />
          )}
          <input
            ref={inputRef}
            type="file"
            accept={contentTypes.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button type="button" size="sm" variant="outline" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
            <ImageUp className="mr-1.5 h-4 w-4" />
            {upload.isPending ? "Uploading…" : assetId ? "Replace image" : "Upload image"}
          </Button>
        </div>
      </div>
    </FieldRow>
  );
}

interface PreviewModel {
  name: string;
  logoText?: string;
  tagline?: string;
  logoUrl?: string;
  color?: string;
  heroImageUrl?: string;
  copy: (key: string) => string;
  sections: { key: string; shown: boolean }[];
}

function BrandPreview({ model }: { model: PreviewModel }) {
  const primary = model.color ?? "hsl(var(--primary))";
  const onPrimary = model.color ? `rgb(${readableOn(hexToRgb(model.color)).join(" ")})` : "hsl(var(--primary-foreground))";
  return (
    <div className="overflow-hidden rounded-lg border bg-background text-foreground shadow-sm" aria-label="Home page preview">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {model.logoUrl ? (
          <img src={model.logoUrl} alt="" className="h-7 w-7 rounded object-contain" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded" style={{ background: primary, color: onPrimary }}>
            <Car className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-xs font-bold">{model.logoText || model.name}</span>
          {model.tagline && <span className="block truncate text-[10px] text-muted-foreground">{model.tagline}</span>}
        </span>
      </div>
      <div className="relative overflow-hidden text-white" style={{ background: heroBackground(primary) }}>
        {model.heroImageUrl && (
          <>
            <img src={model.heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 opacity-[0.85]" style={{ background: heroBackground(primary) }} />
          </>
        )}
        <div className="relative space-y-1.5 px-4 py-6">
          <p className="text-base font-bold leading-snug">{model.copy("heroTitle")}</p>
          <p className="text-xs text-white/85">{model.copy("heroSubtitle")}</p>
          <span className="inline-block rounded bg-white px-2 py-1 text-[10px] font-medium text-slate-900">Book a Test Drive</span>
        </div>
      </div>
      <div className="grid gap-2 border-b bg-muted/30 px-4 py-3">
        {[1, 2, 3].map((n) => (
          <div key={n}>
            <p className="text-[11px] font-semibold">{model.copy(`feature${n}Title`)}</p>
            <p className="text-[10px] text-muted-foreground">{model.copy(`feature${n}Body`)}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 px-4 py-3">
        {model.sections.map((s) => (
          <span key={s.key} className={cn("rounded border px-1.5 py-0.5 text-[10px]", !s.shown && "text-muted-foreground line-through")}>
            {SECTION_LABELS[s.key] ?? s.key}
          </span>
        ))}
      </div>
      <div className="px-4 pb-4 text-center">
        <p className="text-xs font-semibold">{model.copy("ctaTitle")}</p>
        <p className="text-[10px] text-muted-foreground">{model.copy("ctaSubtitle")}</p>
        <span className="mt-2 inline-block rounded px-2 py-1 text-[10px] font-medium" style={{ background: primary, color: onPrimary }}>
          Explore All Vehicles
        </span>
      </div>
    </div>
  );
}

export function AdminBrandingPage() {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const [scope, setScope] = React.useState<ConfigScopeParams | null>(null);
  const [form, setForm] = React.useState<BrandForm | null>(null);
  const [language, setLanguage] = React.useState<string>(SUPPORTED_LANGUAGES[0].code);
  const [savedAt, setSavedAt] = React.useState<number>();
  const queryKey = ["admin-branding", scope?.dealershipId ?? null];

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => getBranding(scope!),
    enabled: scope !== null,
  });

  React.useEffect(() => {
    setForm(data ? toForm(data.own, data.schema) : null);
  }, [data]);

  const save = useMutation({
    mutationFn: (layer: BrandLayerDto) => saveBranding(scope!, layer),
    onSuccess: (view) => {
      queryClient.setQueryData(queryKey, view);
      queryClient.invalidateQueries({ queryKey: ["dealership-config"] });
      setSavedAt(Date.now());
    },
  });

  const saved = React.useMemo(() => (data ? JSON.stringify(toLayer(toForm(data.own, data.schema))) : ""), [data]);
  const isDirty = !!form && JSON.stringify(toLayer(form)) !== saved;
  const errors = form ? validate(form) : {};
  const hasErrors = Object.keys(errors).length > 0;

  const resetSave = save.reset;
  const changeScope = React.useCallback(
    (next: ConfigScopeParams) => {
      if (isDirty && !window.confirm("Discard your unsaved branding changes?")) return;
      resetSave();
      setSavedAt(undefined);
      setScope(next);
    },
    [isDirty, resetSave],
  );

  const update = (patch: (draft: BrandForm) => void) => {
    setSavedAt(undefined);
    setForm((prev) => {
      if (!prev) return prev;
      const next: BrandForm = structuredClone(prev);
      patch(next);
      return next;
    });
  };

  const inherited = data?.inherited ?? null;
  const inheritedLabel = inherited ? "Inherited from company-wide branding" : "";
  const defaultCopy = (lang: string, key: string) => i18n.getFixedT(lang)(`home.${key}`);
  const copyPlaceholder = (lang: string, key: string) => inherited?.content.copy?.[lang]?.[key] || defaultCopy(lang, key);

  const preview: PreviewModel | null = React.useMemo(() => {
    if (!form || !data) return null;
    const pick = (key: keyof BrandingFieldsDto) => form.branding[key].trim() || inherited?.branding[key] || undefined;
    const color = [form.branding.primaryColorHex.trim(), inherited?.branding.primaryColorHex].find(isHexColor);
    const ownLogo = imageUrl(form.branding.logoUrl.trim(), form.logoAssetId);
    const ownHero = imageUrl(form.heroImageUrl.trim(), form.heroImageAssetId);
    return {
      name: data.name,
      logoText: pick("logoText"),
      tagline: pick("tagline"),
      logoUrl: ownLogo ?? imageUrl(inherited?.branding.logoUrl, inherited?.content.logoAssetId),
      color,
      heroImageUrl: ownHero ?? imageUrl(inherited?.content.heroImageUrl, inherited?.content.heroImageAssetId),
      copy: (key) => form.copy[language]?.[key]?.trim() || copyPlaceholder(language, key),
      sections: Object.entries(form.sections).map(([key, choice]) => ({
        key,
        shown: choice === "inherit" ? inherited?.content.sections?.[key] ?? true : choice === "show",
      })),
    };
    // copyPlaceholder derives from inherited and i18n, both covered by the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, data, inherited, language, i18n]);

  const color = preview?.color;
  const rgb = color ? hexToRgb(color) : undefined;
  const scopeNoun = scope?.dealershipId ? "Inherit" : "Default";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Branding &amp; Home Page</h1>
        <p className="text-sm text-muted-foreground">
          How the customer site looks and reads. A dealership's own settings override the company-wide ones field by field; anything left
          blank inherits.
        </p>
      </div>

      <div className="mb-6 max-w-3xl">
        <ConfigScopePicker value={scope} onChange={changeScope} />
      </div>

      {scope && isLoading && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
          <div className="hidden h-96 animate-pulse rounded-lg bg-muted lg:block" />
        </div>
      )}
      {isError && <p className="text-destructive">{errorMessage(error) ?? "Couldn't load branding."}</p>}

      {scope && data && form && preview && (
        <form
          className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!hasErrors) save.mutate(toLayer(form));
          }}
        >
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Brand</CardTitle>
                <CardDescription>
                  {data.name}
                  {inherited && " — blank fields show the company-wide value they inherit."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FieldRow
                  id="brand-color"
                  label="Brand colour"
                  error={errors.primaryColorHex}
                  isSet={!!form.branding.primaryColorHex}
                  resetLabel={scopeNoun}
                  onReset={() => update((d) => void (d.branding.primaryColorHex = ""))}
                  hint="Buttons, links and the home-page banner use this colour."
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Pick brand colour"
                      className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
                      value={color ?? "#000000"}
                      onChange={(e) => update((d) => void (d.branding.primaryColorHex = e.target.value.toUpperCase()))}
                    />
                    <Input
                      id="brand-color"
                      className="max-w-[10rem] font-mono uppercase"
                      maxLength={7}
                      placeholder={inherited?.branding.primaryColorHex ?? "#1A73E8"}
                      value={form.branding.primaryColorHex}
                      onChange={(e) => update((d) => void (d.branding.primaryColorHex = e.target.value))}
                    />
                  </div>
                </FieldRow>
                {rgb && (
                  <ul className="space-y-1.5 rounded-md border bg-muted/30 p-3" aria-label="Colour contrast (WCAG AA)">
                    <ContrastRow label="Button text on brand colour" ratio={contrastRatio(rgb, readableOn(rgb))} minimum={WCAG_AA_NORMAL} />
                    <ContrastRow label="Banner headline (white)" ratio={heroTextContrast(color!)} minimum={WCAG_AA_LARGE} />
                    <ContrastRow label="Icons and links on white" ratio={contrastRatio(rgb, WHITE)} minimum={WCAG_AA_LARGE} />
                  </ul>
                )}

                <ImageField
                  kind="logo"
                  label="Logo"
                  url={form.branding.logoUrl}
                  assetId={form.logoAssetId}
                  inheritedUrl={imageUrl(inherited?.branding.logoUrl, inherited?.content.logoAssetId)}
                  inheritedLabel={inheritedLabel}
                  urlError={errors.logoUrl}
                  schema={data.schema}
                  scope={scope}
                  onChange={({ url, assetId }) =>
                    update((d) => {
                      d.branding.logoUrl = url;
                      d.logoAssetId = assetId;
                    })
                  }
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  {TEXT_FIELDS.map((field) => {
                    const id = `brand-${field.key}`;
                    const props = {
                      id,
                      maxLength: data.schema.brandingMaxLength[field.key],
                      placeholder: inherited?.branding[field.key] ?? "",
                      value: form.branding[field.key],
                      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                        update((d) => void (d.branding[field.key] = e.target.value)),
                    };
                    return (
                      <div key={field.key} className={cn(field.multiline && "sm:col-span-2")}>
                        <FieldRow
                          id={id}
                          label={field.label}
                          error={errors[field.key]}
                          isSet={!!form.branding[field.key]}
                          resetLabel={scopeNoun}
                          onReset={() => update((d) => void (d.branding[field.key] = ""))}
                        >
                          {field.multiline ? <textarea className={TEXTAREA_CLASS} rows={2} {...props} /> : <Input type={field.type ?? "text"} {...props} />}
                        </FieldRow>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Home page</CardTitle>
                <CardDescription>Banner image and which vehicle sections customers see.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ImageField
                  kind="hero"
                  label="Banner image"
                  url={form.heroImageUrl}
                  assetId={form.heroImageAssetId}
                  inheritedUrl={imageUrl(inherited?.content.heroImageUrl, inherited?.content.heroImageAssetId)}
                  inheritedLabel={inheritedLabel}
                  urlError={errors.heroImageUrl}
                  schema={data.schema}
                  scope={scope}
                  onChange={({ url, assetId }) =>
                    update((d) => {
                      d.heroImageUrl = url;
                      d.heroImageAssetId = assetId;
                    })
                  }
                />
                <div className="space-y-2">
                  {data.schema.sectionKeys.map((key) => {
                    const inheritedShown = inherited?.content.sections?.[key] ?? true;
                    return (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <Label htmlFor={`section-${key}`}>{SECTION_LABELS[key] ?? key}</Label>
                        <select
                          id={`section-${key}`}
                          className={SELECT_CLASS}
                          value={form.sections[key]}
                          onChange={(e) => update((d) => void (d.sections[key] = e.target.value as SectionChoice))}
                        >
                          <option value="inherit">
                            {scopeNoun} ({inheritedShown ? "shown" : "hidden"})
                          </option>
                          <option value="show">Show</option>
                          <option value="hide">Hide</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Home page text</CardTitle>
                <CardDescription>Per language. Blank fields keep the text shown as the placeholder.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Language">
                  {SUPPORTED_LANGUAGES.map(({ code, label }) => {
                    const count = Object.values(form.copy[code] ?? {}).filter((v) => v.trim()).length;
                    return (
                      <Button
                        key={code}
                        type="button"
                        size="sm"
                        variant={language === code ? "default" : "outline"}
                        aria-pressed={language === code}
                        onClick={() => setLanguage(code)}
                      >
                        {label}
                        {count > 0 && <span className="ml-1.5 text-xs opacity-80">({count})</span>}
                      </Button>
                    );
                  })}
                </div>
                <div className="space-y-4" lang={language}>
                  {Object.entries(data.schema.copyMaxLength).map(([key, maxLength]) => {
                    const id = `copy-${language}-${key}`;
                    const value = form.copy[language]?.[key] ?? "";
                    const props = {
                      id,
                      maxLength,
                      placeholder: copyPlaceholder(language, key),
                      value,
                      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                        update((d) => void ((d.copy[language] ??= {})[key] = e.target.value)),
                    };
                    return (
                      <FieldRow
                        key={id}
                        id={id}
                        label={COPY_LABELS[key] ?? key}
                        isSet={!!value}
                        resetLabel={scopeNoun}
                        onReset={() => update((d) => void (d.copy[language][key] = ""))}
                        hint={value ? `${value.length}/${maxLength}` : undefined}
                      >
                        {maxLength > MULTILINE_COPY_LENGTH ? <textarea className={TEXTAREA_CLASS} rows={2} {...props} /> : <Input {...props} />}
                      </FieldRow>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Preview</h2>
              <Badge variant="outline">{SUPPORTED_LANGUAGES.find((l) => l.code === language)?.label}</Badge>
            </div>
            <BrandPreview model={preview} />

            <div className="space-y-2 rounded-lg border bg-background p-3">
              {save.isError && <p className="text-sm text-destructive">{errorMessage(save.error)}</p>}
              {hasErrors && <p className="text-sm text-destructive">Fix the highlighted fields to save.</p>}
              {savedAt && !isDirty && (
                <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <Check className="h-4 w-4" /> Saved. Customers see it within a minute.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="flex-1" disabled={!isDirty || hasErrors || save.isPending}>
                  {save.isPending ? "Saving…" : "Save changes"}
                </Button>
                <Button type="button" variant="outline" disabled={!isDirty || save.isPending} onClick={() => setForm(toForm(data.own, data.schema))}>
                  <X className="mr-1 h-4 w-4" /> Discard
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                disabled={save.isPending}
                onClick={() => update((d) => Object.assign(d, toForm({ branding: {}, content: {} }, data.schema)))}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {inherited ? "Clear everything (inherit company-wide)" : "Clear everything (app defaults)"}
              </Button>
            </div>
          </aside>
        </form>
      )}

      {scope && (
        <div className="mt-6 space-y-6 lg:max-w-[calc(100%-23.5rem)]">
          <RegionalSettingsCard key={scope.dealershipId ?? "company"} scope={scope} />
          {!scope.branchId && <BookingScheduleCard key={`schedule-${scope.dealershipId ?? "company"}`} scope={scope} />}
        </div>
      )}
    </div>
  );
}
