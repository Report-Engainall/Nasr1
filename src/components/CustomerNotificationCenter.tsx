import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Bell, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import type { Notification } from '@/lib/types';

function notificationDestination(notification: Notification, isStaff: boolean): 'order' | 'task' | 'service-case' | null {
  if (notification.entity_type === 'order' && typeof notification.entity_id === 'string') return 'order';
  if (isStaff && notification.entity_type === 'ai_task' && typeof notification.entity_id === 'string') return 'task';
  if (notification.entity_type === 'customer_service_case' && typeof notification.entity_id === 'string') return 'service-case';
  return null;
}

function NotificationItem({
  notification,
  isStaff,
  busy,
  onOpen,
  onRead,
}: {
  notification: Notification;
  isStaff: boolean;
  busy: boolean;
  onOpen: (notification: Notification) => void;
  onRead: (notificationId: string) => void;
}) {
  const destination = notificationDestination(notification, isStaff);

  return (
    <article
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      style={{ display: 'grid', gap: 10, borderInlineStart: notification.is_read ? '3px solid var(--border)' : '3px solid var(--primary)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
          <span aria-hidden="true" className="mt-1 rounded-full bg-muted p-2 text-primary"><Bell size={17} /></span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{notification.title}</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--muted-foreground)', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{notification.body || 'لا توجد تفاصيل إضافية.'}</p>
            <time dateTime={notification.created_at} style={{ display: 'block', marginTop: 8, color: 'var(--muted-foreground)', fontSize: 11 }}>
              {formatDate(notification.created_at)}
            </time>
          </div>
        </div>
        {!notification.is_read && <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">جديد</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {destination && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onOpen(notification)}>
            <ExternalLink size={14} /> {destination === 'order' ? 'فتح تفاصيل الطلب' : destination === 'task' ? 'فتح المهمة' : isStaff ? 'فتح مكتب خدمة العملاء' : 'فتح مركز خدمة العملاء'}
          </button>
        )}
        {!notification.is_read && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onRead(notification.id)}>
            <Check size={14} /> تعليم كمقروء
          </button>
        )}
      </div>
    </article>
  );
}

export function CustomerNotificationCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useFetch(
    () => user ? fetchNotifications() : Promise.resolve([]),
    [user?.profileId],
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const notifications = data ?? [];
  const unread = notifications.filter((item) => !item.is_read).length;

  // Poll only while the customer notification page is visible and the browser is online.
  // This provides a safe delivery fallback when realtime transport is unavailable.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refetch();
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [refetch]);

  async function markAllRead() {
    setBusyId('__all__');
    setActionError('');
    try {
      await markAllNotificationsRead();
      await refetch();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذر تعليم التنبيهات كمقروءة.');
    } finally {
      setBusyId(null);
    }
  }

  async function markRead(notificationId: string) {
    setBusyId(notificationId);
    setActionError('');
    try {
      await markNotificationRead(notificationId);
      await refetch();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذر تحديث حالة التنبيه.');
    } finally {
      setBusyId(null);
    }
  }

  async function openDestination(notification: Notification) {
    const destination = notificationDestination(notification, Boolean(user?.isStaff));
    if (!destination || !notification.entity_id) return;
    setBusyId(notification.id);
    setActionError('');
    try {
      if (!notification.is_read) await markNotificationRead(notification.id);
      if (destination === 'order') {
        await navigate({ to: '/orders/$id', params: { id: notification.entity_id } });
      } else if (destination === 'task') {
        await navigate({ to: '/admin/tasks' });
      } else {
        await navigate({ to: user?.isStaff ? '/admin/service-desk' : '/service-cases' });
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذر فتح العنصر المرتبط بالتنبيه.');
    } finally {
      setBusyId(null);
    }
  }

  if (!user) {
    return (
      <main className="storefront" dir="rtl" style={{ paddingTop: 32, paddingBottom: 40 }}>
        <section className="rounded-xl border border-border bg-card p-8 text-center">
          <Bell size={28} style={{ margin: '0 auto 10px', color: 'var(--muted-foreground)' }} />
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>تنبيهات الحساب</h1>
          <p style={{ margin: '8px 0 16px', color: 'var(--muted-foreground)', fontSize: 13 }}>سجّل الدخول لعرض التنبيهات المرتبطة بحسابك.</p>
          <Link to="/login" className="btn btn-primary">تسجيل الدخول</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="storefront" dir="rtl" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 23, fontWeight: 900 }}>التنبيهات</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
            {notifications.length.toLocaleString('ar-YE')} تنبيه — {unread.toLocaleString('ar-YE')} غير مقروء
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {unread > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { void markAllRead(); }} disabled={busyId === '__all__'}>
              <Check size={14} /> تعليم الكل كمقروء
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { void refetch(); }} disabled={loading}>
            <RefreshCw size={15} /> تحديث
          </button>
        </div>
      </header>

      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      {loading ? (
        <div role="status" className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">جار تحميل التنبيهات...</div>
      ) : error ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => { void refetch(); }}>إعادة المحاولة</button>
        </section>
      ) : notifications.length === 0 ? (
        <section className="rounded-xl border border-border bg-card p-8 text-center">
          <Bell size={28} style={{ margin: '0 auto 10px', color: 'var(--muted-foreground)' }} />
          <p style={{ margin: 0, fontWeight: 700 }}>لا توجد تنبيهات حالياً.</p>
          <p style={{ margin: '6px 0 0', color: 'var(--muted-foreground)', fontSize: 12 }}>ستظهر هنا تحديثات الطلبات والإجراءات المرتبطة بحسابك.</p>
        </section>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              isStaff={Boolean(user?.isStaff)}
              busy={busyId === notification.id}
              onOpen={(item) => { void openDestination(item); }}
              onRead={(id) => { void markRead(id); }}
            />
          ))}
        </div>
      )}
      <p style={{ marginTop: 14, color: 'var(--muted-foreground)', fontSize: 11 }}>
        تظهر التنبيهات التي أرسلها النظام إلى حسابك الحالي فقط. بيانات العملاء الآخرين غير متاحة من هذه الصفحة.
      </p>
    </main>
  );
}
