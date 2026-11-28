import { describe, expect, it } from "vitest";
import { CUSTOMER_SHOPPING_LIST_VISIBLE_PAGE_SIZE, filterCustomerShoppingListCatalog, projectCustomerShoppingListCatalogPage } from "@/lib/customer-shopping-list-catalog";
describe("customer shopping-list catalog search visibility", () => {
 const products=Array.from({length:175},(_,index)=>({id:"product-"+index,name:"صنف اختبار "+index,item_code:"SKU-"+String(index).padStart(3,"0"),sku:"BAR-"+index,barcode:null}));
 it("reveals matching results beyond the first 80 without dropping them from search",()=>{
  const filtered=filterCustomerShoppingListCatalog(products,"sku-");
  expect(filtered).toHaveLength(175);
  const first=projectCustomerShoppingListCatalogPage(filtered,CUSTOMER_SHOPPING_LIST_VISIBLE_PAGE_SIZE);
  expect(first.items).toHaveLength(80);expect(first.hasMore).toBe(true);expect(first.nextVisibleCount).toBe(160);
  const second=projectCustomerShoppingListCatalogPage(filtered,first.nextVisibleCount);
  expect(second.items).toHaveLength(160);expect(second.total).toBe(175);expect(second.hasMore).toBe(true);
  const last=projectCustomerShoppingListCatalogPage(filtered,240);
  expect(last.items).toHaveLength(175);expect(last.hasMore).toBe(false);expect(last.items[174].id).toBe("product-174");
 });
 it("searches name, item code, SKU and barcode while preserving original products",()=>{
  expect(filterCustomerShoppingListCatalog(products,"صنف اختبار 17")).toHaveLength(6);
  expect(filterCustomerShoppingListCatalog(products,"SKU-174")[0].id).toBe("product-174");
  expect(filterCustomerShoppingListCatalog(products,"BAR-42")[0].id).toBe("product-42");
  expect(filterCustomerShoppingListCatalog(products,"no-match")).toHaveLength(0);
  expect(products).toHaveLength(175);
 });
});


import { CUSTOMER_SHOPPING_LIST_SERVER_PAGE_SIZE, mergeCustomerShoppingListCatalogProducts, projectCustomerShoppingListServerPage } from "@/lib/customer-shopping-list-catalog";

describe("customer shopping-list server catalog paging", () => {
  it("pages beyond the initial server limit with a stable ID cursor and deduplicated merge", () => {
    const rows = Array.from({ length: 405 }, (_, index) => ({
      id: "id-" + String(index).padStart(3, "0"),
      name: "صنف " + String(index).padStart(3, "0"),
    }));
    const first = projectCustomerShoppingListServerPage(rows);
    expect(first.items).toHaveLength(CUSTOMER_SHOPPING_LIST_SERVER_PAGE_SIZE);
    expect(first.cursor).toBe("id-199");
    expect(first.hasMore).toBe(true);
    const afterFirst = rows.filter((row) => row.id > first.cursor!);
    const second = projectCustomerShoppingListServerPage(afterFirst);
    expect(second.items).toHaveLength(200);
    expect(second.cursor).toBe("id-399");
    expect(second.hasMore).toBe(true);
    const afterSecond = afterFirst.filter((row) => row.id > second.cursor!);
    const third = projectCustomerShoppingListServerPage(afterSecond);
    expect(third.items).toHaveLength(5);
    expect(third.hasMore).toBe(false);
    const all = mergeCustomerShoppingListCatalogProducts(
      mergeCustomerShoppingListCatalogProducts(first.items, second.items),
      [...third.items, first.items[0]],
    );
    expect(all).toHaveLength(405);
    expect(new Set(all.map((row) => row.id)).size).toBe(405);
    expect(all[0].name).toBe("صنف 000");
  });
});
