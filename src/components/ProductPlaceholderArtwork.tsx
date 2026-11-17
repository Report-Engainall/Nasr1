import type { CSSProperties } from "react";

export type ProductPlaceholderVariant =
  | "food" | "beverage" | "cleaning" | "personal-care"
  | "electrical" | "tools" | "stationery" | "general";

type Props = {
  productName: string;
  description?: string | null;
  categoryName?: string | null;
  compact?: boolean;
};

type Palette = { background: string; primary: string; secondary: string; accent: string; ink: string };

const PALETTES: Record<ProductPlaceholderVariant, Palette> = {
  food: { background: "#f5eee0", primary: "#bd884a", secondary: "#e4c38b", accent: "#548b69", ink: "#644a30" },
  beverage: { background: "#e8f3f2", primary: "#4d9a9b", secondary: "#b7dadd", accent: "#d7a54c", ink: "#285e68" },
  cleaning: { background: "#e9f2f3", primary: "#4c9ca0", secondary: "#acd3d5", accent: "#e4bd68", ink: "#285f65" },
  "personal-care": { background: "#f2edf4", primary: "#9474a7", secondary: "#d9c8e2", accent: "#d59c91", ink: "#5b496b" },
  electrical: { background: "#f3f0e2", primary: "#c69d43", secondary: "#eadba4", accent: "#5e8a83", ink: "#5d512c" },
  tools: { background: "#e9eef0", primary: "#627d88", secondary: "#b7c7cb", accent: "#c39a5c", ink: "#3b525e" },
  stationery: { background: "#eef0e8", primary: "#6c8c79", secondary: "#c6d6c8", accent: "#d0a45b", ink: "#3e5a4a" },
  general: { background: "#edf1ef", primary: "#678c82", secondary: "#c1d1ca", accent: "#c7a15e", ink: "#405c55" },
};

function normalizeProductText(value: string): string {
  return value.normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/gu, "")
    .replace(/[إأآ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ة/gu, "ه")
    .toLocaleLowerCase("ar");
}

const RULES: Array<{ variant: ProductPlaceholderVariant; pattern: RegExp }> = [
  { variant: "cleaning", pattern: /منظف|تنظيف|صابون|مسحوق|كلور|مطهر|معقم|ملمع|مبيض|detergent|cleaner|soap|bleach/iu },
  { variant: "personal-care", pattern: /شامبو|بلسم|كريم|عطر|معجون|فرشاه|مستحضر|عنايه|shampoo|conditioner|cream|perfume|toothpaste/iu },
  { variant: "beverage", pattern: /مياه|ماء|عصير|مشروبات|مشروب|شراب|water|juice|beverage|drink/iu },
  { variant: "food", pattern: /ارز|رز|سكر|دقيق|طحين|مكرونه|معكرونه|زيت|شاي|قهوه|بهارات|بسكويت|معلبات|حليب|غذائي|food|rice|sugar|flour|pasta|oil|tea|coffee/iu },
  { variant: "electrical", pattern: /كهرباء|بطاريه|لمبه|مصباح|كابل|سلك|قاطع|battery|cable|lamp|bulb|electrical/iu },
  { variant: "tools", pattern: /ادوات|مسامير|مسمار|مطرقه|مفك|كماشه|مفتاح انجليزي|عدد|tool|screw|hammer|wrench|pliers/iu },
  { variant: "stationery", pattern: /ورق|قلم|اقلام|دفتر|كراس|قرطاسيه|paper|pen|notebook|stationery/iu },
];

export function resolveProductPlaceholderVariant(input: {
  productName: string;
  description?: string | null;
  categoryName?: string | null;
}): ProductPlaceholderVariant {
  const searchable = normalizeProductText(
    [input.categoryName, input.productName, input.description].filter(Boolean).join(" "),
  );
  return RULES.find((rule) => rule.pattern.test(searchable))?.variant ?? "general";
}

function IllustrationShape({ variant, palette }: { variant: ProductPlaceholderVariant; palette: Palette }) {
  const { primary, secondary, accent, ink } = palette;

  if (variant === "beverage") return <g>
    <path d="M190 92h62v30l17 22v169q0 22-22 22h-85q-22 0-22-22V144l17-22V92h33V72h33v20" fill={primary}/>
    <rect x="158" y="217" width="102" height="66" rx="10" fill={secondary}/>
    <path d="M176 248q34-30 68 0" fill="none" stroke={accent} strokeWidth="8" strokeLinecap="round"/>
    <rect x="290" y="155" width="78" height="165" rx="20" fill={secondary}/>
    <rect x="307" y="132" width="44" height="26" rx="6" fill={ink}/>
    <path d="M304 223h50v48h-50z" fill="#fff" opacity=".75"/>
  </g>;

  if (variant === "cleaning") return <g>
    <path d="M147 121h86v31l22 23v142q0 24-24 24h-82q-24 0-24-24V175l22-23z" fill={primary}/>
    <path d="M160 121h61V98h-61z" fill={ink}/>
    <path d="M220 142h69q19 0 19 19v25h-85v-25q0-19-3-19z" fill={secondary}/>
    <rect x="153" y="218" width="108" height="64" rx="9" fill={secondary}/>
    <path d="M174 250q31-20 66 0" fill="none" stroke={accent} strokeWidth="8" strokeLinecap="round"/>
    <rect x="320" y="174" width="52" height="139" rx="12" fill={secondary}/>
    <rect x="329" y="151" width="34" height="25" rx="5" fill={ink}/>
  </g>;

  if (variant === "personal-care") return <g>
    <path d="M146 150h104v167q0 17-17 17h-70q-17 0-17-17z" fill={primary}/>
    <rect x="171" y="119" width="54" height="33" rx="7" fill={ink}/>
    <rect x="160" y="218" width="76" height="68" rx="12" fill="#fff" opacity=".82"/>
    <circle cx="198" cy="252" r="18" fill={secondary}/>
    <path d="M294 166h72l-9 151h-54z" fill={secondary}/>
    <rect x="300" y="140" width="60" height="28" rx="8" fill={accent}/>
    <path d="M310 238h40" stroke={primary} strokeWidth="9" strokeLinecap="round"/>
  </g>;

  if (variant === "electrical") return <g>
    <path d="M194 92c-57 0-91 40-91 91 0 35 19 58 43 83 13 14 19 30 21 46h55c3-16 9-32 22-46 24-25 43-48 43-83 0-51-36-91-93-91z" fill={secondary}/>
    <path d="M167 312h58v18h-58zM174 336h44v15h-44z" fill={ink}/>
    <path d="M195 137v81m-35-45 35 45 35-45" fill="none" stroke={accent} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="306" y="201" width="72" height="122" rx="14" fill={primary}/>
    <rect x="324" y="179" width="36" height="24" rx="5" fill={ink}/>
    <rect x="320" y="235" width="44" height="43" rx="7" fill="#fff" opacity=".8"/>
  </g>;

  if (variant === "tools") return <g>
    <rect x="110" y="211" width="265" height="115" rx="18" fill={primary}/>
    <path d="M184 210v-42q0-20 20-20h78q20 0 20 20v42" fill="none" stroke={ink} strokeWidth="18" strokeLinecap="round"/>
    <rect x="132" y="240" width="220" height="15" rx="7" fill={secondary}/>
    <path d="m310 105 26 26-89 89-26-26z" fill={accent}/>
    <path d="m304 99 20-20 43 43-20 20z" fill={secondary}/>
  </g>;

  if (variant === "stationery") return <g>
    <path d="M117 177q0-17 17-17h132q17 0 17 17v151H117z" fill={primary}/>
    <path d="M139 181h123v147H139z" fill={secondary}/>
    <path d="M163 214h74M163 241h74M163 268h54" stroke={ink} strokeWidth="8" strokeLinecap="round" opacity=".65"/>
    <path d="m298 112 34-13 73 182-35 14z" fill={accent}/>
    <path d="m298 112 34-13-2-17-35 13z" fill={ink}/>
  </g>;

  if (variant === "food") return <g>
    <path d="m111 140 37-30h111l35 30-14 191H126z" fill={primary}/>
    <path d="M148 110h111l-11 25h-89z" fill={ink} opacity=".24"/>
    <path d="M153 206q49-40 96 0v64h-96z" fill={secondary}/>
    <path d="M177 238q28-38 60-43" fill="none" stroke={accent} strokeWidth="8" strokeLinecap="round"/>
    <rect x="296" y="172" width="83" height="151" rx="16" fill={secondary}/>
    <rect x="310" y="150" width="55" height="27" rx="7" fill={ink}/>
    <rect x="309" y="221" width="57" height="52" rx="8" fill="#fffaf0"/>
    <path d="M324 249q15-23 28 0" fill="none" stroke={accent} strokeWidth="7" strokeLinecap="round"/>
  </g>;

  return <g>
    <path d="m110 186 130-77 130 77v137l-130 55-130-55z" fill={primary}/>
    <path d="m110 186 130 74 130-74-130-77z" fill={secondary}/>
    <path d="M240 260v118l130-55V186z" fill={ink} opacity=".16"/>
    <path d="M214 156h52v85l-26 15-26-15z" fill={accent}/>
    <path d="M190 207h100" stroke="#fff" strokeWidth="10" strokeLinecap="round" opacity=".75"/>
    <rect x="335" y="105" width="50" height="48" rx="8" fill={secondary}/>
  </g>;
}

/** Original local illustration. It is a labelled display fallback, never saved as product media. */
export function ProductPlaceholderArtwork({ productName, description, categoryName, compact = false }: Props) {
  const variant = resolveProductPlaceholderVariant({ productName, description, categoryName });
  const palette = PALETTES[variant];
  const style: CSSProperties = {
    position: "relative", display: "block", width: "100%", height: "100%",
    minHeight: compact ? 132 : 250, overflow: "hidden", borderRadius: "inherit",
    background: palette.background,
  };

  return (
    <div role="img" aria-label={"رسم توضيحي مؤقت للمنتج " + productName}
      data-placeholder-variant={variant} style={style}>
      <svg aria-hidden="true" viewBox="0 0 480 360" width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet" style={{ display: "block", minHeight: compact ? 132 : 250 }}>
        <rect width="480" height="360" fill={palette.background}/>
        <circle cx="64" cy="58" r="88" fill={palette.secondary} opacity=".22"/>
        <circle cx="426" cy="315" r="112" fill={palette.accent} opacity=".13"/>
        <path d="M0 294Q120 260 240 294t240 0v66H0z" fill={palette.secondary} opacity=".22"/>
        <ellipse cx="242" cy="329" rx="154" ry="14" fill={palette.ink} opacity=".13"/>
        <IllustrationShape variant={variant} palette={palette}/>
        <path d="M68 113h36M86 95v36M388 70h26M401 57v26" stroke={palette.accent}
          strokeWidth="5" strokeLinecap="round" opacity=".6"/>
      </svg>
      <span aria-hidden="true" style={{
        position: "absolute", insetInlineEnd: 9, bottom: 9, padding: "5px 9px",
        border: "1px solid rgba(255,255,255,.72)", borderRadius: 999, color: palette.ink,
        background: "rgba(255,255,255,.88)", fontSize: 10, fontWeight: 800,
        lineHeight: 1.3, whiteSpace: "nowrap",
      }}>صورة توضيحية مؤقتة</span>
    </div>
  );
}
