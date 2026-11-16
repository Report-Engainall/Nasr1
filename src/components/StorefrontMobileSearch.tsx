import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import type { Category, ProductWithInventory } from "@/lib/types";
import { StorefrontPredictiveSearch } from "@/components/StorefrontPredictiveSearch";

type StorefrontMobileSearchProps = {
  query: string;
  products: ProductWithInventory[];
  categories: Category[];
  loading: boolean;
  productsAvailable: boolean;
  error?: string | null;
  onQueryChange: (value: string) => void;
  onSearch: (value: string) => void;
  onProductSelect: (product: ProductWithInventory) => void;
  onCategorySelect: (category: Category) => void;
};

/**
 * Mobile entry point for the existing catalogue autocomplete.
 * It deliberately reuses the authorized results already loaded by Storefront;
 * opening the dialog never starts a second catalogue request.
 */
export function StorefrontMobileSearch({
  query,
  products,
  categories,
  loading,
  productsAvailable,
  error = null,
  onQueryChange,
  onSearch,
  onProductSelect,
  onCategorySelect,
}: StorefrontMobileSearchProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (wasOpenRef.current && !open) triggerRef.current?.focus();
    wasOpenRef.current = open;
  }, [open]);

  const close = () => setOpen(false);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => element.getAttribute("aria-hidden") !== "true");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      dialogRef.current?.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="sf-mobile-search-trigger"
        aria-label="فتح بحث المنتجات"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Search size={19} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="sf-mobile-search-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          onKeyDown={handleDialogKeyDown}
        >
          <section
            ref={dialogRef}
            className="sf-mobile-search-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sf-mobile-search-heading">
              <h2 id={titleId}>بحث المنتجات</h2>
              <button type="button" aria-label="إغلاق البحث" onClick={close}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <StorefrontPredictiveSearch
              query={query}
              products={products}
              categories={categories}
              loading={loading}
              productsAvailable={productsAvailable}
              error={error}
              autoFocus
              onQueryChange={onQueryChange}
              onSearch={(value) => { onSearch(value); close(); }}
              onProductSelect={(product) => { onProductSelect(product); close(); }}
              onCategorySelect={(category) => { onCategorySelect(category); close(); }}
            />
          </section>
        </div>
      )}
    </>
  );
}
