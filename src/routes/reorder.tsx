import { useState } from "react";
import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { ReorderWorkspacePage } from "@/components/CustomerWorkflows";
import { CustomerShoppingListsWorkspace } from "@/components/CustomerShoppingListsWorkspace";

export const Route = createFileRoute("/reorder")({
  head: () => ({ meta: [{ title: "قوائم المشتريات وإعادة الطلب | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جار تحميل قوائم المشتريات...</main>}><ReorderWorkspaceHub /></ClientOnly>,
});

function ReorderWorkspaceHub() {
  const [active, setActive] = useState<"lists" | "templates">("lists");
  return (
    <div className="storefront" dir="rtl">
      <nav aria-label="مساحات الطلب" role="tablist" style={{
        display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center",
        padding: "12px 16px", background: "#f5f9f8", borderBottom: "1px solid #dce8e7",
      }}>
        <button
          type="button"
          role="tab"
          aria-selected={active === "lists"}
          onClick={() => setActive("lists")}
          style={{
            border: "1px solid " + (active === "lists" ? "#087f8d" : "#d3e1df"),
            borderRadius: 22, padding: "9px 16px", cursor: "pointer",
            background: active === "lists" ? "#087f8d" : "#fff",
            color: active === "lists" ? "#fff" : "#28575a", fontWeight: 800,
          }}
        >
          قوائم المشتريات والدورات
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === "templates"}
          onClick={() => setActive("templates")}
          style={{
            border: "1px solid " + (active === "templates" ? "#087f8d" : "#d3e1df"),
            borderRadius: 22, padding: "9px 16px", cursor: "pointer",
            background: active === "templates" ? "#087f8d" : "#fff",
            color: active === "templates" ? "#fff" : "#28575a", fontWeight: 800,
          }}
        >
          قوالب إعادة الطلب السابقة
        </button>
      </nav>
      {active === "lists" ? <CustomerShoppingListsWorkspace /> : <ReorderWorkspacePage />}
    </div>
  );
}
