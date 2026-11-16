import { useState } from "react";
import { BrainCircuit, ScrollText, ShieldCheck } from "lucide-react";
import { AiCenter } from "@/components/AdminPages";
import { useAuth } from "@/lib/auth";
import { PromptGovernancePanel } from "@/components/reference-model/ai-governance/PromptGovernancePanel";
import { AiUsageAuditPanel } from "@/components/reference-model/ai-governance/AiUsageAuditPanel";

type WorkspaceTab = "center" | "prompts" | "audit";

type Props = {
  onNotice: (message: string) => void;
};

export function AdminAiGovernanceWorkspace({ onNotice }: Props) {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.roles.includes("admin"));
  const canReadUsageAudit = Boolean(
    user?.roles.some((role) => role === "admin" || role === "manager"),
  );
  const [selectedTab, setSelectedTab] = useState<WorkspaceTab>("center");

  const tabs: Array<{
    id: WorkspaceTab;
    label: string;
    description: string;
    icon: typeof BrainCircuit;
  }> = [
    {
      id: "center",
      label: "المركز التشغيلي",
      description: "التنبيهات والمهام وإعداد بوابة الذكاء",
      icon: BrainCircuit,
    },
    ...(isAdmin
      ? [{
          id: "prompts" as const,
          label: "حوكمة الأوامر",
          description: "إصدارات الأوامر والمراجعة والاعتماد والتفعيل",
          icon: ScrollText,
        }]
      : []),
    ...(canReadUsageAudit
      ? [{
          id: "audit" as const,
          label: "تدقيق الاستخدام",
          description: "سجل المحاولات والحصص وقياس الاستهلاك",
          icon: ShieldCheck,
        }]
      : []),
  ];

  // Resolve the active panel from the current role on every render. If a session
  // changes from admin to a narrower role, a previously selected privileged tab
  // falls back to the operational center immediately instead of remaining mounted.
  const activeTab = tabs.some((tab) => tab.id === selectedTab) ? selectedTab : "center";
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const panelId = "admin-ai-governance-panel-" + activeTab;

  return (
    <section dir="rtl" className="space-y-4" aria-label="مساحات مركز الذكاء">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">مركز الذكاء</h1>
        <p className="text-sm text-muted-foreground">
          مساحة موحدة للتشغيل وحوكمة الأوامر وتدقيق الاستخدام، مع إبقاء الصلاحيات لدى الخادم.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="أقسام مركز الذكاء"
        className="flex flex-wrap gap-2 border-b pb-3"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={"admin-ai-governance-tab-" + tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={"admin-ai-governance-panel-" + tab.id}
              title={tab.description}
              onClick={() => setSelectedTab(tab.id)}
              className={[
                "inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted",
              ].join(" ")}
            >
              <Icon size={16} aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={"admin-ai-governance-tab-" + activeTab}
        tabIndex={0}
        className="min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {activeTab === "center" ? <AiCenter onNotice={onNotice} /> : null}
        {activeTab === "prompts" && isAdmin ? <PromptGovernancePanel /> : null}
        {activeTab === "audit" && canReadUsageAudit ? <AiUsageAuditPanel /> : null}
        {!active ? null : null}
      </div>
    </section>
  );
}
