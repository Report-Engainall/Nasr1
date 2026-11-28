import { ProductPlaceholderArtwork } from "@/components/ProductPlaceholderArtwork";
import { normalizeStorefrontArtworkKey, STOREFRONT_ARTWORK_OPTIONS, type StorefrontArtworkKey } from "@/lib/storefront-artwork";

type Props = { label: string; value: StorefrontArtworkKey; onChange: (value: StorefrontArtworkKey) => void; previewName: string; disabled?: boolean; compact?: boolean };

export function StorefrontArtworkPicker({ label, value, onChange, previewName, disabled = false, compact = true }: Props) {
  const safeValue = normalizeStorefrontArtworkKey(value);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(170px,1fr) minmax(112px,156px)", gap: 12, alignItems: "center" }}>
      <label style={{ display: "grid", gap: 7, minWidth: 0, fontSize: 12, fontWeight: 750 }}>
        <span>{label}</span>
        <select aria-label={label} value={safeValue} disabled={disabled} onChange={(event) => onChange(normalizeStorefrontArtworkKey(event.target.value))}
          style={{ width: "100%", minHeight: 40, padding: "8px 10px", border: "1px solid var(--border, #cbd5e1)", borderRadius: 8, background: "var(--background, #fff)", color: "inherit", font: "inherit" }}>
          {STOREFRONT_ARTWORK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <span style={{ color: "var(--muted-foreground, #64748b)", fontSize: 11, fontWeight: 500, lineHeight: 1.6 }}>رسم توضيحي محلي مؤقت، وليس صورة أصلية.</span>
      </label>
      <div style={{ minWidth: 0, height: compact ? 88 : 128, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border, #dbe3e8)" }}>
        <ProductPlaceholderArtwork productName={previewName} variantOverride={safeValue} compact caption="معاينة الرسم" accessibleLabel={"معاينة الرسم " + previewName} />
      </div>
    </div>
  );
}
