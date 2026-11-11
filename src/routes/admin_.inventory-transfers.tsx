import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { LazyAdminApp as AdminApp } from "@/components/LazyAdminApp";

import { AdminRouteFallback } from "@/components/AdminRouteFallback";
export const Route = createFileRoute('/admin_/inventory-transfers')({
  head: () => ({ meta: [{ title: 'سجل تحويلات المخزون | متجر الأغبري' }, { name: 'robots', content: 'noindex' }] }),
  component: () => <ClientOnly fallback={<AdminRouteFallback />}><AdminApp initialView="inventory-transfers" /></ClientOnly>,
});
