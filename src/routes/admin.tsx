import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { LazyAdminApp as AdminApp } from "@/components/LazyAdminApp";
import { AdminRouteFallback } from "@/components/AdminRouteFallback";
import { buildAghbariDocumentTitle } from "@/lib/aghbari-brand";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: buildAghbariDocumentTitle("لوحة الإدارة ومركز التشغيل") },
      { name: "description", content: "لوحة إدارة الأغبري: الطلبات والمنتجات والعملاء والتسعير والمخزون والتقارير." },
      { property: "og:title", content: buildAghbariDocumentTitle("لوحة الإدارة") },
      { property: "og:description", content: "مركز تشغيل منصة الأغبري للتجارة بالجملة." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <ClientOnly fallback={<AdminRouteFallback />}><AdminApp /></ClientOnly>,
});
