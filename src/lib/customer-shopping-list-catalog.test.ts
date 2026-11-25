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
  expect(filterCustomerShoppingListCatalog(products,"صنف اختبار 17")).toHaveLength(11);
  expect(filterCustomerShoppingListCatalog(products,"SKU-174")[0].id).toBe("product-174");
  expect(filterCustomerShoppingListCatalog(products,"BAR-42")[0].id).toBe("product-42");
  expect(filterCustomerShoppingListCatalog(products,"no-match")).toHaveLength(0);
  expect(products).toHaveLength(175);
 });
});
