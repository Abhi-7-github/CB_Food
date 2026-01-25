import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Cart from './Cart.jsx'
import Home from './Home.jsx'
import Navbar from './Navbar.jsx'
import OrderPage from './OrderPage.jsx'
import Orders from './Orders.jsx'
import { getFoods } from './api/cbKareApi.js'
import { useLocalStorageState } from './hooks/useLocalStorageState.js'
import AdminPage from './AdminPage.jsx'

const DUMMY_FOODS = [
  {
    id: 'dummy-paneer-wrap',
    name: 'Dummy Paneer Wrap',
    description: 'Test item (frontend-only) to verify UI & ordering flow.',
    isVeg: true,
    price: 99,
    image: 'https://placehold.co/96x96?text=Food',
    isActive: true,
  },
]

function App() {
  const location = useLocation()

  const [cart, setCart] = useLocalStorageState('cbkare.cart', {})
  const [adminKey, setAdminKey] = useLocalStorageState('cbkare.adminKey', '')

  const [foods, setFoods] = useState([])
  const [foodsLoading, setFoodsLoading] = useState(true)
  const [foodsError, setFoodsError] = useState('')

  const effectiveFoods = useMemo(() => {
    if (foodsLoading || foodsError) return foods
    if (Array.isArray(foods) && foods.length > 0) return foods
    return import.meta.env.DEV ? DUMMY_FOODS : foods
  }, [foods, foodsError, foodsLoading])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setFoodsLoading(true)
        setFoodsError('')
        const data = await getFoods()
        if (cancelled) return
        setFoods(Array.isArray(data) ? data : [])
      } catch (e) {
        if (cancelled) return
        setFoods([])
        setFoodsError(e?.message || 'Failed to load foods')
      } finally {
        if (!cancelled) setFoodsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const baseRaw = import.meta.env.VITE_API_BASE_URL
    const base = typeof baseRaw === 'string' ? baseRaw.replace(/\/$/, '') : ''
    const url = base ? `${base}/api/stream` : '/api/stream'

    const es = new EventSource(url)

    let timer = null
    const scheduleRefresh = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        refreshFoods()
      }, 300)
    }

    es.addEventListener('foodsChanged', scheduleRefresh)
    es.onerror = () => {
      // ignore; EventSource auto-reconnects
    }

    return () => {
      if (timer) window.clearTimeout(timer)
      es.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshFoods = async () => {
    try {
      setFoodsError('')
      const data = await getFoods()
      setFoods(Array.isArray(data) ? data : [])
    } catch (e) {
      setFoodsError(e?.message || 'Failed to load foods')
    }
  }

  const cartCount = useMemo(() => {
    return Object.values(cart).reduce((sum, n) => sum + n, 0)
  }, [cart])

  const isHomeRoute = location.pathname === '/'

  return (
    <div className={
      'min-h-screen bg-white text-slate-900 flex flex-col ' +
      (isHomeRoute ? 'overflow-hidden' : '')
    }>
      <Navbar cartCount={cartCount} adminKey={adminKey} />

      <main className={
        'mx-auto w-full max-w-6xl flex-1 min-h-0 px-4 py-6 ' +
        (isHomeRoute ? 'overflow-hidden' : '')
      }>
        <Routes>
          <Route
            path="/"
            element={
              <Home
                foods={effectiveFoods}
                foodsLoading={foodsLoading}
                foodsError={foodsError}
                cart={cart}
                setCart={setCart}
              />
            }
          />
          <Route path="/cart" element={<Cart foods={effectiveFoods} cart={cart} setCart={setCart} />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/order" element={<OrderPage foods={effectiveFoods} cart={cart} setCart={setCart} />} />
          <Route path="/admin/*" element={<AdminPage adminKey={adminKey} setAdminKey={setAdminKey} onFoodsChanged={refreshFoods} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
