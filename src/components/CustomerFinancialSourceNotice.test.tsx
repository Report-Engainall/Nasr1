// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CustomerFinancialSourceNotice } from "./CustomerFinancialSourceNotice";
import type { CustomerFinancialSource } from "@/lib/customer-financial-source";
const appOnly: CustomerFinancialSource = {source_mode:"APP_ONLY",source_status:"active",source_as_of:null,last_synced_at:null,verified_at:null,revision:1,is_stale:false,can_read_app_ledger:true};
afterEach(()=>cleanup());
describe("CustomerFinancialSourceNotice",()=>{
  it("labels the app ledger as the only source for APP_ONLY customers",()=>{
    render(<CustomerFinancialSourceNotice source={appOnly} loading={false}/>);
    expect(screen.getByText(/مصدر الحساب المالي: دفتر متجر الأغبري/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
  it("labels the selected ERP and keeps its account separate from the app ledger",()=>{
    render(<CustomerFinancialSourceNotice source={{...appOnly,source_mode:"ONYX",source_as_of:"2026-11-27T20:00:00Z",last_synced_at:"2026-11-27T20:05:00Z",can_read_app_ledger:false}} loading={false}/>);
    expect(screen.getByText(/مصدر الحساب المحدد: Onyx Pro/)).toBeInTheDocument();
    expect(screen.getByText(/لن نخلط هذا الحساب مع دفتر متجر الأغبري/)).toBeInTheDocument();
  });
  it("warns when the external source snapshot is stale",()=>{
    render(<CustomerFinancialSourceNotice source={{...appOnly,source_mode:"MUTAKAMEL",source_as_of:"2026-11-25T20:00:00Z",is_stale:true,can_read_app_ledger:false}} loading={false}/>);
    expect(screen.getByText(/بيانات المصدر قديمة/)).toBeInTheDocument();
  });
  it("fails closed while source lookup is missing or rejected",()=>{
    render(<CustomerFinancialSourceNotice source={null} loading={false} error="تعذر التحقق من مصدر الحساب." />);
    expect(screen.getByRole("alert")).toHaveTextContent("تعذر التحقق من مصدر الحساب.");
  });
  it("blocks a suspended source",()=>{
    render(<CustomerFinancialSourceNotice source={{...appOnly,source_status:"suspended",can_read_app_ledger:false}} loading={false}/>);
    expect(screen.getByRole("alert")).toHaveTextContent("مصدر الحساب المالي موقوف");
  });
});
