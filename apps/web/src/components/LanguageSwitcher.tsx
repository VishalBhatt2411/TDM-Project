import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "@/i18n";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n } = useTranslation();

  return (
    <label className={className}>
      <span className="sr-only">{"Language"}</span>
      <div className="flex items-center gap-1 text-muted-foreground">
        <Languages className="h-4 w-4" />
        <select
          aria-label="Language"
          className="bg-transparent text-sm text-muted-foreground outline-none"
          value={i18n.resolvedLanguage ?? "en"}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.label}</option>
          ))}
        </select>
      </div>
    </label>
  );
}
