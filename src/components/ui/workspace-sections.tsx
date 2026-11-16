import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type WorkspaceSectionHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  titleId?: string;
  actions?: ReactNode;
  className?: string;
};

/** Canonical page header shared by administration and customer workspaces. */
export function WorkspaceSectionHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  titleId,
  actions,
  className,
}: WorkspaceSectionHeaderProps) {
  return (
    <header className={["heading", "workspace-section-heading", className].filter(Boolean).join(" ")} dir="rtl">
      <span className="heading-icon workspace-section-heading__icon" aria-hidden="true">
        <Icon size={23} strokeWidth={1.9} />
      </span>
      <div className="workspace-section-heading__copy">
        <span>{eyebrow}</span>
        <h1 id={titleId}>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="workspace-section-heading__actions">{actions}</div> : null}
    </header>
  );
}

export type WorkspaceSectionGroupProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  headingClassName?: string;
  iconClassName?: string;
  contentClassName?: string;
  onActivate?: () => void;
  activateLabel?: string;
};

/** Reusable section → category header → linked tools composition. */
export function WorkspaceSectionGroup({
  icon: Icon,
  title,
  description,
  children,
  className,
  headingClassName,
  iconClassName,
  contentClassName,
  onActivate,
  activateLabel,
}: WorkspaceSectionGroupProps) {
  const headingContent = (
    <>
      <span className={["workspace-section-group__icon", iconClassName].filter(Boolean).join(" ")}>
        <Icon size={20} strokeWidth={1.9} />
      </span>
      <span className="workspace-section-group__copy">
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </>
  );

  return (
    <section className={["workspace-section-group", className].filter(Boolean).join(" ")} aria-label={title} dir="rtl">
      {onActivate ? (
        <button
          type="button"
          className={["workspace-section-group__heading", headingClassName].filter(Boolean).join(" ")}
          onClick={onActivate}
          aria-label={activateLabel ?? `فتح ${title}`}
        >
          {headingContent}
        </button>
      ) : (
        <header className={["workspace-section-group__heading", headingClassName].filter(Boolean).join(" ")}>
          {headingContent}
        </header>
      )}
      <div className={["workspace-section-group__content", contentClassName].filter(Boolean).join(" ")}>
        {children}
      </div>
    </section>
  );
}
