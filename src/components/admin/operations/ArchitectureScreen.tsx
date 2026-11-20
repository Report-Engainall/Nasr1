import { ArchitectureRegistryPanel } from "@/components/reference-model/observability/ArchitectureRegistryPanel";
import { SourceBoundaryStatusPanel } from "@/components/reference-model/observability/SourceBoundaryStatusPanel";

export function ArchitectureScreen() {
  return (
    <section dir="rtl" aria-label="معمارية النظام" className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">معمارية النظام</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          عرض قراءة فقط مشتق من شجرة TanStack Router ومجموعات التنقل ومصفوفة الوصول المعتمدة، مع إظهار عقود الخدمات المعروفة وحدودها.
        </p>
      </header>
      <ArchitectureRegistryPanel />
      <SourceBoundaryStatusPanel />
      <p className="text-xs leading-6 text-muted-foreground">
        لا يتوفر حالياً سجل موثوق شامل يربط جميع مكونات الواجهة بالخدمات وRPC والتكاملات. لذلك تعرض اللوحة فقط المسارات المسجلة فعلياً وعقود المصادر الموثقة؛ لا تستنتج تبعيات من أسماء الملفات.
      </p>
    </section>
  );
}
