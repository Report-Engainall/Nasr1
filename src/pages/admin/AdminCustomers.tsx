import { useState } from 'react';
import { Customers } from '../../components/AghbariApp';
import { AuthProvider } from '../../lib/auth';

export default function AdminCustomers() {
  const [notice, setNotice] = useState('');

  return (
    <AuthProvider>
      <section aria-label="إدارة العملاء">
        {notice && (
          <div
            role="status"
            aria-live="polite"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '12px 16px',
              marginBottom: '16px',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              background: 'var(--color-surface)',
            }}
          >
            <span>{notice}</span>
            <button className="btn btn-sm btn-secondary" type="button" onClick={() => setNotice('')}>
              إغلاق
            </button>
          </div>
        )}
        <Customers onNotice={setNotice} />
      </section>
    </AuthProvider>
  );
}
