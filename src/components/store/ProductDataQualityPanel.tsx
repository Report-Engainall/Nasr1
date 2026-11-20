import {
  assessProductDataQuality,
  type AlternateUnitQualityState,
} from "@/lib/storefront-product-data-quality";

function StatusMark({ complete }: { complete: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: 20,
        height: 20,
        borderRadius: 99,
        background: complete ? "#e8f5ed" : "#fff0e8",
        color: complete ? "#176b43" : "#a44820",
        fontWeight: 800,
        flex: "0 0 auto",
      }}
    >
      {complete ? "✓" : "!"}
    </span>
  );
}

export function ProductDataQualityPanel({
  imageCount,
  description,
  salesUnit,
  alternateUnitCount,
  alternateUnitState,
}: {
  imageCount: number;
  description: string | null | undefined;
  salesUnit: string | null | undefined;
  alternateUnitCount: number;
  alternateUnitState: AlternateUnitQualityState;
}) {
  const report = assessProductDataQuality({
    imageCount,
    description,
    salesUnit,
    alternateUnitCount,
    alternateUnitState,
  });
  const missingCount = report.totalCount - report.completeCount;

  return (
    <section
      aria-labelledby="sf-product-data-quality-title"
      style={{
        display: "grid",
        gap: 10,
        margin: "12px 0 16px",
        padding: 14,
        border: "1px solid #dce8e5",
        borderRadius: 12,
        background: "#f8fbfa",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <strong id="sf-product-data-quality-title" style={{ color: "#264640", fontSize: 13 }}>
          مراجعة جودة بيانات المنتج
        </strong>
        <span style={{ fontSize: 12, fontWeight: 800, color: missingCount ? "#9a5424" : "#176b43" }}>
          اكتمال البيانات الأساسية {report.score}% ({report.completeCount}/{report.totalCount})
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="نسبة اكتمال البيانات الأساسية"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={report.score}
        style={{ height: 6, overflow: "hidden", borderRadius: 99, background: "#e5ece9" }}
      >
        <span
          style={{
            display: "block",
            width: report.score + "%",
            height: "100%",
            background: missingCount ? "#b97935" : "#2d8a5b",
          }}
        />
      </div>
      <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
        {report.checks.map((check) => (
          <li key={check.key} style={{ display: "flex", alignItems: "center", gap: 8, color: "#405c56", fontSize: 12 }}>
            <StatusMark complete={check.complete} />
            <span>{check.complete ? "مكتمل: " + check.label : "ناقص: " + check.label}</span>
          </li>
        ))}
      </ul>
      <p
        role={report.alternateUnits.tone === "unknown" ? "status" : undefined}
        style={{ margin: 0, color: "#61736e", fontSize: 12 }}
      >
        {report.alternateUnits.label}
      </p>
    </section>
  );
}
