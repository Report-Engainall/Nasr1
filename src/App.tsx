import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useAuthStore, loadCustomerProfile } from './lib/authStore'
import { synchronizeSession } from './lib/app-auth-bootstrap'
import StoreHeader from './components/store/StoreHeader'
import StoreFooter from './components/store/StoreFooter'
import BannerSlider from './components/store/BannerSlider'
import HomePage from './pages/store/HomePage'
import ProductsPage from './pages/store/ProductsPage'
import ProductDetailPage from './pages/store/ProductDetailPage'
import CartPage from './pages/store/CartPage'
import OrdersPage from './pages/store/OrdersPage'
import OrderDetailPage from './pages/store/OrderDetailPage'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import PendingApprovalPage from './pages/auth/PendingApprovalPage'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminProducts from './pages/admin/AdminProducts'
import AdminOrders from './pages/admin/AdminOrders'
import AdminCustomers from './pages/admin/AdminCustomers'
import AdminSettings from './pages/admin/AdminSettings'

function StoreShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StoreHeader />
      <BannerSlider />
      <main className="main-content">{children}</main>
      <StoreFooter />
    </>
  )
}

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { session, isAdmin, loading, customer } = useAuthStore()
  if (loading) return <div className="text-center mt-20 text-muted">جارٍ التحميل...</div>
  if (!session) return <Navigate to="/login" replace />
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />
  if (!requireAdmin && !isAdmin && customer?.status === 'pending') return <Navigate to="/pending-approval" replace />
  return <>{children}</>
}

export default function App() {
  const { setSession, setCustomer, setAdmin, setLoading } = useAuthStore()

  useEffect(() => {
    let mounted = true
    const actions = { setSession, setCustomer, setAdmin, setLoading }
    const isMounted = () => mounted
    const finishFailedHydration = () => {
      if (!mounted) return
      setCustomer(null)
      setAdmin(false)
      setLoading(false)
    }

    void supabase.auth.getSession()
      .then(({ data: { session } }) => synchronizeSession(session, actions, loadCustomerProfile, isMounted))
      .catch(finishFailedHydration)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void synchronizeSession(session, actions, loadCustomerProfile, isMounted).catch(finishFailedHydration)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [setSession, setCustomer, setAdmin, setLoading])

  const { session, isAdmin } = useAuthStore()
  const showStore = !session || !isAdmin

  return (
    <div className="app-container">
      <Routes>
        <Route path="/login" element={session ? <Navigate to={isAdmin ? '/admin' : '/'} /> : <LoginPage />} />
        <Route path="/register" element={session ? <Navigate to="/" /> : <RegisterPage />} />
        <Route path="/pending-approval" element={<ProtectedRoute><PendingApprovalPage /></ProtectedRoute>} />
        <Route path="/" element={showStore ? <StoreShell><HomePage /></StoreShell> : <Navigate to="/admin" />} />
        <Route path="/products" element={showStore ? <StoreShell><ProductsPage /></StoreShell> : <Navigate to="/admin" />} />
        <Route path="/product/:id" element={showStore ? <StoreShell><ProductDetailPage /></StoreShell> : <Navigate to="/admin" />} />
        <Route path="/cart" element={<ProtectedRoute><StoreShell><CartPage /></StoreShell></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute><StoreShell><OrdersPage /></StoreShell></ProtectedRoute>} />
        <Route path="/orders/:id" element={<ProtectedRoute><StoreShell><OrderDetailPage /></StoreShell></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  )
}
