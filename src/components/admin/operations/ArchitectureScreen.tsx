import { ArchitectureRegistryPanel } from "@/components/reference-model/observability/ArchitectureRegistryPanel";

export function ArchitectureScreen() {
  return (
    <section dir="rtl" aria-label="معمارية النظام" className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">معمارية النظام</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          عرض قراءة فقط مشتق من شجرة TanStack Router ومجموعات التنقل ومصفوفة الوصول المعتمدة؛ لا توجد شجرة موازية.
        </p>
      </header>
      <ArchitectureRegistryPanel />
    </section>
  );
}
