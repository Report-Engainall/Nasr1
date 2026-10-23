import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { StorefrontCategoryLandingPage } from "@/components/StorefrontCategoryLandingPage";

export const Route = createFileRoute("/category/$slug")({
  head: ({ params }) => ({ meta: [{ title: "التصنيف | متجر الأغبري", description: "أصناف منشورة ضمن التصنيف " + params.slug }] }),
  component: CategorySlugPage,
});

function CategorySlugPage() {
  const { slug } = Route.useParams();
  const { pathname } = useLocation();

  // The advanced category route is nested under /category/$slug in the
  // generated file-route tree. Do not let the parent landing page hide it.
  if (pathname.includes("/subcategory/")) return <Outlet />;

  return <StorefrontCategoryLandingPage categorySlug={slug} />;
}
