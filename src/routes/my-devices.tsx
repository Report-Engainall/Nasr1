import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CustomerMyDevicesPage } from "@/components/CustomerMyDevicesPage";

export const Route = createFileRoute("/my-devices")({
  head: () => ({
    meta: [
      { title: "أجهزتي وأصولي | متجر الأغبري" },
      { name: "description", content: "عرض أجهزتك وأصولك والضمان وسجل الصيانة المرتبط بحسابك." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جار تحميل سجل أجهزتك...</main>}>
      <CustomerMyDevicesPage />
    </ClientOnly>
  ),
});
