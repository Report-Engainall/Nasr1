import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw, RotateCcw, Search } from "lucide-react";
import { Login } from "@/components/Login";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatDate, formatNumber } from "@/lib/format";
import { readCustomerReturnSummary, type CustomerReturnRequestRecord } from "@/lib/customer-returns";

const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type CustomerOrderRow = {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
};
type OrderReturns = CustomerOrderRow & {
  requests: CustomerReturnRequestRecord[];
};

const statusLabels: Record<string, string> = {
  submitted: "مرسل للمراجعة",
  under_review: "قيد المراجعة",
  approved: "مقبول — بانتظار الاستلام والفحص",
  rejected: "مرفوض",
  received: "تم استلام المرتجع",
  closed: "مغلق",
  cancelled: "ملغى",
};
const reasonLabels: Record<string, string> = {
  damaged: "الصنف تالف",
  wrong_item: "صنف أو مقاس غير صحيح",
  missing_item: "كمية ناقصة",
  quality: "مشكلة جودة",
  other: "سبب آخر",
};

function validOrder(value: unknown): value is CustomerOrderRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && UUID.test(row.id) &&
    typeof row.order_number === "string" && row.order_number.trim().length > 0 &&
    typeof row.status === "string" &&
    typeof row.created_at === "string" && Number.isFinite(Date.parse(row.created_at));
}

export function CustomerReturnsPage() {
  const { user, ready } = useAuth();
  const [orders, setOrders] = useState<OrderReturns[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError("");
    try {
      const { data, error: orderError, count } = await supabase
        .from("orders")
        .select("id,order_number,status,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (orderError) throw new Error("تعذر تحميل طلبات الحساب.");
      if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
        throw new Error("لم يؤكد الخادم عدد الطلبات؛ أعد المحاولة.");
      }
      const rows = data ?? [];
      if (rows.some(row => !validOrder(row))) {
        throw new Error("أعاد الخادم بيانات طلب غير مكتملة؛ لم يتم عرض سجل مرتجعات جزئي.");
      }
      const checked = await Promise.all((rows as CustomerOrderRow[]).map(async order => {
        const { data: summaryData, error: summaryError } = await supabase.rpc("list_my_customer_return_requests", {
          p_order_id: order.id,
        });
        if (summaryError) {
          throw new Error("تعذر قراءة سجل المرتجعات للطلب " + order.order_number + ".");
        }
        const summary = readCustomerReturnSummary(summaryData);
        return { ...order, requests: summary.requests };
      }));
      if (generation !== requestGeneration.current) return;
      setTotalOrders(count);
      setOrders(checked);
    } catch (cause) {
      if (generation !== requestGeneration.current) return;
      setOrders([]);
      setTotalOrders(0);
      setError(cause instanceof Error ? cause.message : "تعذر تحميل سجل المرتجعات.");
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (!ready || !user || user.isStaff) return;
    void load();
    return () => { requestGeneration.current += 1; };
  }, [ready, user, load]);

  const requests = useMemo(
    () => orders.flatMap(order => order.requests.map(request => ({ order, request }))),
    [orders],
  );
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("ar");
    if (!value) return requests;
    return requests.filter(({ order, request }) => [
      order.order_number,
      request.request_number,
      statusLabels[request.status] ?? request.status,
      reasonLabels[request.reason] ?? request.reason,
      request.notes ?? "",
      request.review_note ?? "",
    ].join(" ").toLocaleLowerCase("ar").includes(value));
  }, [requests, query]);
  const pageCount = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE));

  if (!ready) return <main className="storefront" dir="rtl" role="status">جار التحقق من الحساب...</main>;
  if (!user) return <Login />;
  if (user.isStaff) return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10" dir="rtl">
      <section className="rounded-2xl border bg-card p-6">
        <h1 className="text-xl font-bold">مرتجعات العملاء</h1>
        <p className="mt-2 text-sm text-muted-foreground">هذه الصفحة مخصصة لحساب العميل. استخدم طابور مراجعة المرتجعات في مساحة الإدارة.</p>
        <Link to="/admin/returns" className="mt-4 inline-flex items-center gap-2 text-primary">فتح إدارة المرتجعات <ArrowLeft size={15}/></Link>
      </section>
    </main>
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <header className="mb-6 rounded-2xl border bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/orders" className="inline-flex items-center gap-2 text-sm text-primary hover:underline"><ArrowLeft size={16}/> طلباتي</Link>
            <h1 className="mt-3 text-2xl font-bold">مرتجعاتي</h1>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              طلبات الإرجاع المسجلة على طلباتك، وحالة كل طلب وقرار المراجعة. تُحمّل النتائج من مصدر المرتجعات المعتمد لكل طلب من حسابك.
            </p>
          </div>
          <button type="button" className="btn secondary" disabled={loading} onClick={() => void load()}>
            <RefreshCw size={16}/>{loading ? "جار التحديث..." : "تحديث السجل"}
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border p-3">
            <span className="text-xs text-muted-foreground">الطلبات المفحوصة في الصفحة</span>
            <strong className="mt-1 block text-xl tabular-nums">{orders.length.toLocaleString("ar-YE")}</strong>
          </article>
          <article className="rounded-xl border p-3">
            <span className="text-xs text-muted-foreground">طلبات الإرجاع في الصفحة</span>
            <strong className="mt-1 block text-xl tabular-nums">{requests.length.toLocaleString("ar-YE")}</strong>
          </article>
          <article className="rounded-xl border p-3">
            <span className="text-xs text-muted-foreground">إجمالي الطلبات</span>
            <strong className="mt-1 block text-xl tabular-nums">{totalOrders.toLocaleString("ar-YE")}</strong>
          </article>
        </div>
      </header>

      {error ? (
        <section className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800" role="alert">
          <p>{error}</p>
          <button type="button" className="mt-2 underline" onClick={() => void load()}>إعادة المحاولة</button>
        </section>
      ) : null}

      <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border bg-background px-3 py-2">
          <Search size={17} className="text-muted-foreground"/>
          <input value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="ابحث برقم الطلب أو المرتجع أو السبب" maxLength={120}/>
        </label>
        <span className="text-xs text-muted-foreground">{filtered.length.toLocaleString("ar-YE")} طلب إرجاع مطابق في الصفحة الحالية</span>
      </section>

      {loading ? (
        <p role="status" className="rounded-xl border bg-card p-6 text-sm">جار تحميل طلباتك وسجل المرتجعات...</p>
      ) : error ? null : filtered.length === 0 ? (
        <section className="rounded-xl border bg-card p-8 text-center" role="status">
          <RotateCcw size={30} className="mx-auto text-muted-foreground"/>
          <h2 className="mt-3 font-semibold">{query ? "لا توجد نتائج مطابقة" : "لا توجد طلبات إرجاع في الطلبات المعروضة"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">يمكن تقديم طلب إرجاع من تفاصيل الطلب بعد تأكيد تسليمه.</p>
          <Link to="/orders" className="mt-4 inline-flex items-center gap-2 text-primary">عرض طلباتي <ArrowLeft size={15}/></Link>
        </section>
      ) : (
        <div className="space-y-4">
          {filtered.map(({ order, request }) => (
            <article key={request.id} className="rounded-xl border bg-card p-4 sm:p-5">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
                <div>
                  <p className="text-xs text-muted-foreground">طلب الإرجاع</p>
                  <strong className="text-lg">{request.request_number}</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    الطلب {order.order_number} · {formatDate(request.created_at)}
                  </p>
                </div>
                <span className="rounded-lg border px-3 py-1.5 text-xs font-semibold">{statusLabels[request.status] ?? request.status}</span>
              </header>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><span className="text-xs text-muted-foreground">سبب الإرجاع</span><p className="mt-1 text-sm font-medium">{reasonLabels[request.reason] ?? request.reason}</p></div>
                <div><span className="text-xs text-muted-foreground">حالة الطلب الأصلي</span><p className="mt-1 text-sm font-medium">{order.status}</p></div>
              </div>
              {request.notes ? <p className="mt-3 text-sm leading-6"><strong>ملاحظتك: </strong>{request.notes}</p> : null}
              {request.review_note ? <p className="mt-3 rounded-lg border bg-muted/30 p-3 text-sm leading-6"><strong>رد المراجعة: </strong>{request.review_note}</p> : null}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead><tr className="border-b text-right text-xs text-muted-foreground"><th className="p-2">الصنف</th><th>الرمز</th><th>الكمية</th><th>الوحدة</th></tr></thead>
                  <tbody>{request.items.map((item,index) => (
                    <tr key={item.order_item_id+"-"+index} className="border-b last:border-0">
                      <td className="p-2">{item.product_name}</td><td>{item.item_code ?? "—"}</td>
                      <td>{formatNumber(item.requested_quantity)}</td><td>{item.unit ?? "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <footer className="mt-3 flex justify-end">
                <a href={"/orders/"+order.id} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">فتح الطلب الأصلي <ArrowLeft size={15}/></a>
              </footer>
            </article>
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <nav className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4" aria-label="ترقيم صفحات مرتجعاتي">
          <span className="text-xs text-muted-foreground">صفحة {page+1} من {pageCount} · تعرض كل صفحة 20 طلباً أصلياً كحد أعلى</span>
          <div className="flex gap-2">
            <button type="button" className="btn secondary" disabled={page===0||loading} onClick={()=>setPage(value=>Math.max(0,value-1))}>السابق</button>
            <button type="button" className="btn secondary" disabled={page+1>=pageCount||loading} onClick={()=>setPage(value=>value+1)}>التالي</button>
          </div>
        </nav>
      ) : null}
      <p className="mt-4 text-xs leading-6 text-muted-foreground">
        تُفحص طلباتك بصفحات من 20 طلباً. عدد طلبات الإرجاع المعروض يخص الطلبات في الصفحة الحالية فقط، وليس إجمالي سجل المؤسسة أو كل الصفحات غير المحمّلة.
      </p>
    </main>
  );
}
