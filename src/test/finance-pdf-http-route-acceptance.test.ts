import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFinanceDocumentClient: vi.fn(),
  loadArabicDocumentFont: vi.fn(),
  buildCustomerInvoicePdf: vi.fn(),
  buildCustomerStatementPdf: vi.fn(),
}));

vi.mock("@/lib/finance-pdf-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/finance-pdf-server")>();
  return {
    ...actual,
    getFinanceDocumentClient: mocks.getFinanceDocumentClient,
    loadArabicDocumentFont: mocks.loadArabicDocumentFont,
  };
});

vi.mock("@/lib/finance-document-pdf", () => ({
  buildCustomerInvoicePdf: mocks.buildCustomerInvoicePdf,
  buildCustomerStatementPdf: mocks.buildCustomerStatementPdf,
}));

import { Route as InvoicePdfRoute } from "@/routes/api.invoice-pdf.$invoiceId";
import { Route as StatementPdfRoute } from "@/routes/api.statement-pdf";

type HttpGetContext = { request: Request; params?: Record<string, string> };
type HttpGetHandler = (context: HttpGetContext) => Promise<Response>;
type RouteWithServerGet = {
  options?: { server?: { handlers?: { GET?: unknown } } };
};

function getHandler(route: unknown): HttpGetHandler {
  const candidate = (route as RouteWithServerGet).options?.server?.handlers?.GET;
  if (typeof candidate !== "function") {
    throw new Error("Expected the file route to expose a GET server handler");
  }
  return candidate as HttpGetHandler;
}

const invoiceGet = getHandler(InvoicePdfRoute);
const statementGet = getHandler(StatementPdfRoute);
const invoiceId = "11111111-1111-4111-8111-111111111111";
const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
const invoicePayload = {
  invoice: { id: invoiceId, invoice_number: "INV-HTTP-001", status: "issued" },
  lines: [{ item_code: "000125", quantity: "1", description: "صنف تجريبي" }],
  customer: { customer_code: "C-HTTP-001", business_name: "عميل اختبار", tier_label: "الجملة" },
  financial_details_visible: true,
  customer_tier_visible: true,
};

function request(path: string, authenticated = true): Request {
  return new Request("https://store.example.test" + path, {
    headers: authenticated ? { authorization: "Bearer test-access-token" } : {},
  });
}

function rpcClient(data: unknown = invoicePayload, error: unknown = null) {
  const client = { rpc: vi.fn().mockResolvedValue({ data, error }) };
  mocks.getFinanceDocumentClient.mockResolvedValue({ client, userId: "test-auth-user" });
  return client;
}

async function body(response: Response): Promise<unknown> {
  return response.json();
}

describe("finance PDF HTTP route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadArabicDocumentFont.mockReturnValue(new Uint8Array([1, 2, 3]));
    mocks.buildCustomerInvoicePdf.mockReset().mockResolvedValue(pdfBytes);
    mocks.buildCustomerStatementPdf.mockReset().mockResolvedValue(pdfBytes);
  });

  it("rejects unauthenticated invoice downloads before issuing an RPC", async () => {
    mocks.getFinanceDocumentClient.mockResolvedValue({
      response: Response.json({ error: "authentication required" }, { status: 401 }),
    });
    const response = await invoiceGet({
      request: request(`/api/invoice-pdf/${invoiceId}`, false),
      params: { invoiceId },
    });
    expect(response.status).toBe(401);
    expect(await body(response)).toMatchObject({ error: expect.any(String) });
    expect(mocks.buildCustomerInvoicePdf).not.toHaveBeenCalled();
  });

  it("rejects malformed invoice IDs before querying the financial RPC", async () => {
    const client = rpcClient();
    const response = await invoiceGet({
      request: request("/api/invoice-pdf/not-a-uuid"),
      params: { invoiceId: "not-a-uuid" },
    });
    expect(response.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(mocks.buildCustomerInvoicePdf).not.toHaveBeenCalled();
  });

  it.each([
    ["42501", 403],
    ["P0002", 404],
    ["XX000", 503],
  ])("maps invoice RPC error %s to HTTP %i without generating a PDF", async (code, status) => {
    const client = rpcClient(null, { code, message: "synthetic source error" });
    const response = await invoiceGet({
      request: request(`/api/invoice-pdf/${invoiceId}`),
      params: { invoiceId },
    });
    expect(response.status).toBe(status);
    expect(client.rpc).toHaveBeenCalledWith("get_customer_invoice_pdf", { p_invoice_id: invoiceId });
    expect(mocks.buildCustomerInvoicePdf).not.toHaveBeenCalled();
  });

  it("fails closed when the invoice RPC returns an incomplete or inconsistent visibility payload", async () => {
    rpcClient({
      invoice: invoicePayload.invoice,
      lines: invoicePayload.lines,
      customer: { customer_code: "C-HTTP-001", business_name: "عميل اختبار" },
      financial_details_visible: true,
      customer_tier_visible: true,
    });
    const response = await invoiceGet({
      request: request(`/api/invoice-pdf/${invoiceId}`),
      params: { invoiceId },
    });
    expect(response.status).toBe(503);
    expect(mocks.buildCustomerInvoicePdf).not.toHaveBeenCalled();
  });

  it("returns a private, non-cacheable PDF attachment only after the builder succeeds", async () => {
    const client = rpcClient();
    const response = await invoiceGet({
      request: request(`/api/invoice-pdf/${invoiceId}`),
      params: { invoiceId },
    });
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("get_customer_invoice_pdf", { p_invoice_id: invoiceId });
    expect(mocks.buildCustomerInvoicePdf).toHaveBeenCalledWith(
      invoicePayload.invoice,
      invoicePayload.lines,
      invoicePayload.customer,
      expect.any(Uint8Array),
      undefined,
      true,
      true,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toContain('attachment; filename="aghbari-invoice.pdf"');
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("vary")).toBe("Authorization");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...pdfBytes]);
  });

  it("returns 500 instead of a successful PDF response when invoice rendering fails", async () => {
    rpcClient();
    mocks.buildCustomerInvoicePdf.mockRejectedValue(new Error("synthetic PDF rendering failure"));
    const response = await invoiceGet({
      request: request(`/api/invoice-pdf/${invoiceId}`),
      params: { invoiceId },
    });
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("rejects unauthenticated statement downloads before querying the statement RPC", async () => {
    mocks.getFinanceDocumentClient.mockResolvedValue({
      response: Response.json({ error: "authentication required" }, { status: 401 }),
    });
    const response = await statementGet({ request: request("/api/statement-pdf", false) });
    expect(response.status).toBe(401);
    expect(mocks.buildCustomerStatementPdf).not.toHaveBeenCalled();
  });

  it("maps statement permission failures to 403 and source/service failures to 503", async () => {
    const forbiddenClient = rpcClient(null, { code: "42501", message: "permission denied" });
    const forbidden = await statementGet({ request: request("/api/statement-pdf") });
    expect(forbidden.status).toBe(403);
    expect(forbiddenClient.rpc).toHaveBeenCalledWith("get_customer_account_statement");

    const unavailableClient = rpcClient(null, { code: "XX000", message: "database unavailable" });
    const unavailable = await statementGet({ request: request("/api/statement-pdf") });
    expect(unavailable.status).toBe(503);
    expect(unavailableClient.rpc).toHaveBeenCalledWith("get_customer_account_statement");
    expect(mocks.buildCustomerStatementPdf).not.toHaveBeenCalled();
  });

  it("returns the statement PDF with private attachment headers", async () => {
    const statement = { customer: { business_name: "عميل اختبار" }, invoices: [], payments: [], credits: [] };
    const client = rpcClient(statement);
    const response = await statementGet({ request: request("/api/statement-pdf") });
    expect(client.rpc).toHaveBeenCalledWith("get_customer_account_statement");
    expect(mocks.buildCustomerStatementPdf).toHaveBeenCalledWith(statement, expect.any(Uint8Array));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toContain('attachment; filename="aghbari-account-statement.pdf"');
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("Authorization");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...pdfBytes]);
  });

  it("returns 500 rather than a successful statement PDF when rendering fails", async () => {
    rpcClient({ customer: { business_name: "عميل اختبار" }, invoices: [], payments: [], credits: [] });
    mocks.buildCustomerStatementPdf.mockRejectedValue(new Error("synthetic statement rendering failure"));
    const response = await statementGet({ request: request("/api/statement-pdf") });
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
