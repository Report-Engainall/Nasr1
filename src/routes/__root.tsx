import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider, useAuth } from "@/lib/auth";
import { BUSINESS_BRAND_NAME, BUSINESS_META_DESCRIPTION, BUSINESS_PWA_THEME_COLOR } from "@/lib/brand";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          تعذر تحميل الصفحة
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حدث خطأ غير متوقع. حاول مرة أخرى أو عد للرئيسية.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            إعادة المحاولة
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            العودة للرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { title: BUSINESS_BRAND_NAME },
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: BUSINESS_BRAND_NAME },
      { name: "description", content: BUSINESS_META_DESCRIPTION },
      { name: "theme-color", content: BUSINESS_PWA_THEME_COLOR },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: BUSINESS_BRAND_NAME },
      { property: "og:title", content: BUSINESS_BRAND_NAME },
      { property: "og:description", content: BUSINESS_META_DESCRIPTION },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: BUSINESS_BRAND_NAME },
      { name: "twitter:description", content: BUSINESS_META_DESCRIPTION },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthHealthNotice() {
  const { configurationError } = useAuth();
  if (!configurationError) return null;
  return (
    <div role="alert" dir="rtl" style={{
      position: "relative", zIndex: 1000, padding: "12px 16px",
      background: "#fff3cd", color: "#664d03", borderBottom: "1px solid #ffecb5",
      fontFamily: "Cairo, system-ui, sans-serif", fontSize: 14, lineHeight: 1.8,
    }}>
      <strong>تعذر الاتصال بالخدمات الخلفية.</strong>
      <span style={{ marginInlineStart: 8 }}>{configurationError}</span>
    </div>
  );
}

// Use layout effects in the browser so cached private data is removed before the next identity can paint;
 // fall back to a passive effect during SSR.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function AuthScopedOutlet() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const identityKey = user
    ? [user.id, user.profileId, user.isStaff ? "staff" : "customer", [...user.roles].sort().join("\u001e")].join("\u001f")
    : "anonymous";
  const previousIdentityKey = useRef<string | undefined>(undefined);

  useIsomorphicLayoutEffect(() => {
    const previous = previousIdentityKey.current;
    previousIdentityKey.current = identityKey;
    if (previous === undefined || previous === identityKey) return;

    // TanStack Query data and mutation state may contain tenant-specific finance or inventory results.
    // Drop all cached query state and force active route loaders to re-check the new auth context.
    queryClient.clear();
    void router.invalidate().catch(() => undefined);
  }, [identityKey, queryClient, router]);

  // Remount active route-local state on logout, account switch, profile change or effective-role change.
  return <Outlet key={identityKey} />;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <AuthProvider>
        <AuthHealthNotice />
        <nav className="no-print" aria-label="التنقل الرئيسي" style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", padding: "6px 10px", background: "var(--foreground, #0f172a)", fontSize: 13 }}>
          {([["/", "المتجر"], ["/orders", "طلباتي"], ["/admin", "لوحة الإدارة"], ["/login", "الحساب"]] as const).map(([to, label]) => (
            <Link key={to} to={to} activeOptions={{ exact: to === "/" }} style={{ color: "var(--background, #fff)", padding: "4px 12px", borderRadius: 999, textDecoration: "none" }} activeProps={{ style: { background: "var(--primary, #0e7c66)", color: "var(--primary-foreground, #fff)", padding: "4px 12px", borderRadius: 999, textDecoration: "none" } }}>
              {label}
            </Link>
          ))}
        </nav>
        <AuthScopedOutlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}
