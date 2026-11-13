import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Package, Search, Tags } from "lucide-react";
import { MAX_CATALOG_SEARCH_LENGTH, normalizeArabicSearchText, normalizeCatalogSearchQuery } from "@/lib/commerce-utils";
import type { Category, ProductWithInventory } from "@/lib/types";

type PredictiveSuggestion =
  | { kind: "query"; id: string; label: string }
  | { kind: "category"; id: string; label: string; category: Category }
  | { kind: "product"; id: string; label: string; product: ProductWithInventory };

type StorefrontPredictiveSearchProps = {
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
 * Accessible storefront autocomplete.
 *
 * Product suggestions are projections from the already-authorized, paginated
 * storefront RPC response; this component never performs a second catalogue
 * query or calculates/discloses prices, stock, or tenant identifiers.
 */
export function StorefrontPredictiveSearch({
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
}: StorefrontPredictiveSearchProps) {
  const generatedId = useId();
  const listboxId = `aghbari-store-search-${generatedId}`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalizedQuery = normalizeCatalogSearchQuery(query).trim();
  const searchReady = normalizedQuery.length >= 2;

  const categoryMatches = useMemo(() => {
    if (!searchReady) return [];
    const needle = normalizeArabicSearchText(normalizedQuery);
    if (!needle) return [];
    return categories
      .filter((category) => {
        if (!category.is_active) return false;
        const candidate = normalizeArabicSearchText(category.name);
        return Boolean(candidate && (candidate.includes(needle) || needle.includes(candidate)));
      })
      .slice(0, 4);
  }, [categories, normalizedQuery, searchReady]);

  const suggestions = useMemo<PredictiveSuggestion[]>(() => {
    if (!searchReady) return [];
    const entries: PredictiveSuggestion[] = [{
      kind: "query",
      id: "query",
      label: normalizedQuery,
    }];
    for (const category of categoryMatches) {
      entries.push({
        kind: "category",
        id: `category-${category.id}`,
        label: category.name,
        category,
      });
    }
    if (productsAvailable && !loading && !error) {
      for (const product of products.slice(0, 5)) {
        entries.push({
          kind: "product",
          id: `product-${product.id}`,
          label: product.name,
          product,
        });
      }
    }
    return entries;
  }, [categoryMatches, error, loading, normalizedQuery, products, productsAvailable, searchReady]);

  const isOpen = open && searchReady;
  const safeActiveIndex = activeIndex >= 0 && activeIndex < suggestions.length ? activeIndex : -1;
  const activeSuggestion = safeActiveIndex >= 0 ? suggestions[safeActiveIndex] : undefined;

  function selectSuggestion(suggestion: PredictiveSuggestion) {
    setOpen(false);
    setActiveIndex(-1);
    if (suggestion.kind === "query") onSearch(suggestion.label);
    else if (suggestion.kind === "category") onCategorySelect(suggestion.category);
    else onProductSelect(suggestion.product);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (isOpen) {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!searchReady) return;
      event.preventDefault();
      setOpen(true);
      if (suggestions.length === 0) return;
      setActiveIndex(() => {
        // Base navigation on the currently rendered option, not stale state from a prior response.
        const current = safeActiveIndex;
        if (event.key === "ArrowDown") return current < 0 ? 0 : (current + 1) % suggestions.length;
        return current < 0 ? suggestions.length - 1 : (current - 1 + suggestions.length) % suggestions.length;
      });
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (isOpen && activeSuggestion) selectSuggestion(activeSuggestion);
      else if (normalizedQuery) {
        setOpen(false);
        setActiveIndex(-1);
        onSearch(normalizedQuery);
      }
    }
  }

  function renderOption(suggestion: PredictiveSuggestion, index: number) {
    const selected = safeActiveIndex === index;
    const commonStyle = {
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 12px",
      border: 0,
      borderRadius: 8,
      background: selected ? "#edf7f5" : "transparent",
      color: "#173b39",
      textAlign: "right" as const,
      cursor: "pointer",
      font: "inherit",
    };

    if (suggestion.kind === "query") {
      return (
        <button
          key={suggestion.id}
          id={`${listboxId}-option-${index}`}
          type="button"
          role="option"
          aria-selected={selected}
          tabIndex={-1}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => selectSuggestion(suggestion)}
          style={commonStyle}
        >
          <Search size={16} aria-hidden="true" />
          <span>عرض نتائج البحث عن «{suggestion.label}»</span>
        </button>
      );
    }

    if (suggestion.kind === "category") {
      return (
        <button
          key={suggestion.id}
          id={`${listboxId}-option-${index}`}
          type="button"
          role="option"
          aria-selected={selected}
          tabIndex={-1}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => selectSuggestion(suggestion)}
          style={commonStyle}
        >
          <Tags size={16} aria-hidden="true" />
          <span style={{ display: "grid", gap: 2 }}>
            <span>{suggestion.label}</span>
            <small style={{ color: "#66817d" }}>تصنيف</small>
          </span>
        </button>
      );
    }

    return (
      <button
        key={suggestion.id}
        id={`${listboxId}-option-${index}`}
        type="button"
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => selectSuggestion(suggestion)}
        style={commonStyle}
      >
        {suggestion.product.image_url
          ? <img src={suggestion.product.image_url} alt="" loading="lazy" decoding="async" style={{ width: 38, height: 38, objectFit: "contain", borderRadius: 6, background: "#f6f8f7" }} />
          : <Package size={17} aria-hidden="true" />}
        <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <span>{suggestion.label}</span>
          <small style={{ color: "#66817d" }}>{suggestion.product.item_code}</small>
        </span>
      </button>
    );
  }

  return (
    <div className="sf-search" style={{ position: "relative", minWidth: 0 }}>
      <Search size={17} aria-hidden="true" />
      <input
        type="search"
        role="combobox"
        aria-label="ابحث عن منتج"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen && safeActiveIndex >= 0 ? `${listboxId}-option-${safeActiveIndex}` : undefined}
        value={query}
        maxLength={MAX_CATALOG_SEARCH_LENGTH}
        autoComplete="off"
        onFocus={() => {
          if (searchReady) setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          setActiveIndex(-1);
        }}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setActiveIndex(-1);
          setOpen(event.target.value.trim().length >= 2);
        }}
        onKeyDown={handleKeyDown}
        placeholder="ابحث عن منتج..."
      />
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            insetInline: 0,
            zIndex: 80,
            display: "grid",
            gap: 8,
            maxHeight: 380,
            overflowY: "auto",
            padding: 8,
            border: "1px solid #d7e5e1",
            borderRadius: 12,
            background: "#fff",
            boxShadow: "0 14px 38px rgba(18, 57, 52, .16)",
            color: "#173b39",
          }}
        >
          {loading && (
            <div role="status" style={{ padding: 8, color: "#607a75", fontSize: 12 }}>
              جار البحث في كتالوج المتجر...
            </div>
          )}
          {error && (
            <div role="status" style={{ padding: 8, color: "#8a5b24", fontSize: 12 }}>
              تعذر تحميل اقتراحات المنتجات؛ يمكنك متابعة البحث الكامل.
            </div>
          )}
          {productsAvailable && !loading && !error && products.length === 0 && (
            <div role="status" style={{ padding: 8, color: "#607a75", fontSize: 12 }}>
              لا توجد منتجات مطابقة ضمن النتائج الحالية.
            </div>
          )}
          <div
            id={listboxId}
            role="listbox"
            aria-label="اقتراحات البحث"
            aria-busy={loading}
            style={{ display: "grid", gap: 5 }}
          >
            <div role="group" aria-label="البحث بالعبارة">
              <div role="presentation" aria-hidden="true" style={{ padding: "5px 10px", color: "#718985", fontSize: 11, fontWeight: 800 }}>البحث</div>
              {renderOption({ kind: "query", id: "query", label: normalizedQuery }, 0)}
            </div>
            {categoryMatches.length > 0 && (
              <div role="group" aria-label="التصنيفات المطابقة">
                <div role="presentation" aria-hidden="true" style={{ padding: "5px 10px", color: "#718985", fontSize: 11, fontWeight: 800 }}>التصنيفات</div>
                {categoryMatches.map((category, localIndex) => {
                  const index = localIndex + 1;
                  return renderOption({
                    kind: "category",
                    id: `category-${category.id}`,
                    label: category.name,
                    category,
                  }, index);
                })}
              </div>
            )}
            {productsAvailable && !loading && !error && products.length > 0 && (
              <div role="group" aria-label="المنتجات المطابقة">
                <div role="presentation" aria-hidden="true" style={{ padding: "5px 10px", color: "#718985", fontSize: 11, fontWeight: 800 }}>المنتجات</div>
                {products.slice(0, 5).map((product, localIndex) => {
                  const index = 1 + categoryMatches.length + localIndex;
                  return renderOption({
                    kind: "product",
                    id: `product-${product.id}`,
                    label: product.name,
                    product,
                  }, index);
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
