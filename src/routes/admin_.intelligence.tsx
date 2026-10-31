import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { AdminApp } from "@/components/AghbariApp";

export const Route = createFileRoute("/admin_/intelligence")({
  head: () => ({
    meta: [
      { title: "ذكاء الأعمال والتحصيلات | متجر الأغبري" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <ClientOnly fallback={null}><AdminApp initialView="intelligence" /></ClientOnly>,
});
