import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useParams: () => ({ id: "test-order" }),
    useSearch: () => ({}),
    useLocation: () => ({ pathname: "/search" }),
    Outlet: () => null,
  }),
  ClientOnly: ({ fallback }: { fallback?: ReactNode }) => fallback ?? null,
  useNavigate: () => vi.fn(),
}));

vi.mock("@/components/Login", () => ({ Login: () => null }));
vi.mock("@/components/Storefront", () => ({ Storefront: () => null }));
vi.mock("@/components/CustomerOrders", () => ({
  OrderInvoice: () => null,
  MyOrders: () => null,
}));
vi.mock("@/components/CustomerWorkflows", () => ({
  CustomerAddressesPage: () => null,
  CustomerInvoicesPage: () => null,
  CustomerStatementPage: () => null,
  CommerceAssistantPage: () => null,
  BarcodeWorkspacePage: () => null,
  OfflineWorkspacePage: () => null,
  QuoteWorkspacePage: () => null,
  ReorderWorkspacePage: () => null,
  CustomerCompanyContactsPage: () => null,
}));
vi.mock("@/components/CustomerCompanyMembers", () => ({
  CustomerCompanyMembersPage: () => null,
  CompanyInvitationAcceptancePage: () => null,
}));
vi.mock("@/components/CustomerActivationInvitationPage", () => ({
  CustomerActivationInvitationPage: () => null,
}));

import { Route as OrderDetailRoute } from "@/routes/orders.$id";
import { Route as OrdersIndexRoute } from "@/routes/orders.index";
import { Route as InvoicesRoute } from "@/routes/invoices";
import { Route as StatementRoute } from "@/routes/statement";
import { Route as AssistantRoute } from "@/routes/assistant";
import { Route as BarcodeRoute } from "@/routes/barcode";
import { Route as OfflineRoute } from "@/routes/offline";
import { Route as LoginRoute } from "@/routes/login";
import { Route as ForgotPasswordRoute } from "@/routes/forgot-password";
import { Route as RegisterRoute } from "@/routes/register";
import { Route as QuotesRoute } from "@/routes/quotes";
import { Route as ReorderRoute } from "@/routes/reorder";
import { Route as StoreRoute } from "@/routes/index";
import { Route as AddressesRoute } from "@/routes/addresses";
import { Route as CartRoute } from "@/routes/cart";
import { Route as CatalogRoute } from "@/routes/catalog";
import { Route as CheckoutRoute } from "@/routes/checkout";
import { Route as CompareRoute } from "@/routes/compare";
import { Route as ProductRoute } from "@/routes/product.$id";
import { Route as ProductsRoute } from "@/routes/products";
import { Route as SearchRoute } from "@/routes/search";
import { Route as StoreAliasRoute } from "@/routes/store";
import { Route as WishlistRoute } from "@/routes/wishlist";
import { Route as CompanyContactsRoute } from "@/routes/company.contacts";
import { Route as CompanyMembersRoute } from "@/routes/company.members";
import { Route as CompanyAcceptInvitationRoute } from "@/routes/company.accept-invitation";
import { Route as InviteTokenRoute } from "@/routes/invite.$token";
import { Route as CustomerActivateTokenRoute } from "@/routes/customer.activate.$token";

type RouteWithComponent = { options: { component: ComponentType } };
const customerRoutes = [
  { label: "order detail", route: OrderDetailRoute, expected: "جار تحميل تفاصيل الطلب..." },
  { label: "orders list", route: OrdersIndexRoute, expected: "جار تحميل طلباتك..." },
  { label: "invoices", route: InvoicesRoute, expected: "جار تحميل الفواتير..." },
  { label: "account statement", route: StatementRoute, expected: "جار تحميل كشف الحساب..." },
  { label: "assistant", route: AssistantRoute, expected: "جار تحميل المساعد الذكي..." },
  { label: "barcode scanner", route: BarcodeRoute, expected: "جار تحميل ماسح الباركود..." },
  { label: "offline workspace", route: OfflineRoute, expected: "جار تحميل مساحة العمل دون اتصال..." },
  { label: "login", route: LoginRoute, expected: "جار تحميل تسجيل الدخول..." },
  { label: "forgot password", route: ForgotPasswordRoute, expected: "جار تحميل استعادة كلمة المرور..." },
  { label: "registration", route: RegisterRoute, expected: "جار تحميل إنشاء الحساب..." },
  { label: "quotes workspace", route: QuotesRoute, expected: "جار تحميل عروض الأسعار..." },
  { label: "reorder workspace", route: ReorderRoute, expected: "جار تحميل قائمة إعادة الطلب..." },
  { label: "storefront home", route: StoreRoute, expected: "جار تحميل المتجر..." },
  { label: "delivery addresses", route: AddressesRoute, expected: "جارٍ تحميل عناوين التوصيل..." },
  { label: "cart", route: CartRoute, expected: "جار تحميل السلة..." },
  { label: "catalog", route: CatalogRoute, expected: "جار تحميل الكتالوج..." },
  { label: "checkout", route: CheckoutRoute, expected: "جار التحقق من السلة..." },
  { label: "product comparison", route: CompareRoute, expected: "جار تحميل المقارنة..." },
  { label: "product detail", route: ProductRoute, expected: "جار تحميل تفاصيل المنتج..." },
  { label: "products listing", route: ProductsRoute, expected: "جار تحميل كتالوج المنتجات..." },
  { label: "search", route: SearchRoute, expected: "جار فتح البحث…" },
  { label: "store alias", route: StoreAliasRoute, expected: "جار فتح المتجر..." },
  { label: "wishlist", route: WishlistRoute, expected: "جار تحميل المفضلة..." },
  { label: "company contacts", route: CompanyContactsRoute, expected: "جارٍ تحميل جهات الاتصال..." },
  { label: "company members", route: CompanyMembersRoute, expected: "جارٍ تحميل أعضاء الشركة..." },
  { label: "company invitation acceptance", route: CompanyAcceptInvitationRoute, expected: "جارٍ التحقق من الدعوة..." },
  { label: "invitation token", route: InviteTokenRoute, expected: "جارٍ التحقق من الدعوة..." },
  { label: "customer activation token", route: CustomerActivateTokenRoute, expected: "جارٍ التحقق من رابط التفعيل..." },
] as const;

afterEach(() => cleanup());

describe("customer route hydration loading states", () => {
  it.each(customerRoutes)("$label exposes an Arabic RTL loading status", ({ route, expected }) => {
    const component = (route as unknown as RouteWithComponent).options.component;
    render(createElement(component));
    const status = screen.getByRole("status");
    if (route === StoreRoute) expect(status.tagName).toBe("MAIN");
    expect(status).toHaveAttribute("dir", "rtl");
    expect(status).toHaveTextContent(expected);
  });
});
