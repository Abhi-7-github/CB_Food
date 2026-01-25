import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOrders } from './api/cbKareApi.js'

function formatPrice(value) {
  return `₹${value}`
}

function formatDate(isoString) {
  try {
    return new Date(isoString).toLocaleString()
  } catch {
    return isoString
  }
}

function getDisplayStatus(order) {
  const raw = String(order?.status || 'Placed')
  if (raw === 'Placed') return { label: 'Pending', tone: 'amber', icon: '…' }
  if (raw === 'Verified') return { label: 'Accepted', tone: 'emerald', icon: '✓' }
  if (raw === 'Delivered') return { label: 'Delivered', tone: 'sky', icon: '✓✓' }
  if (raw === 'Rejected') return { label: 'Rejected', tone: 'rose', icon: '✕' }
  return { label: raw, tone: 'slate', icon: '' }
}

function badgeClass(tone) {
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (tone === 'emerald') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (tone === 'sky') return 'border-sky-200 bg-sky-50 text-sky-800'
  if (tone === 'rose') return 'border-rose-200 bg-rose-50 text-rose-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

export default function Orders() {
  const navigate = useNavigate()

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError('')
        const data = await getOrders()
        if (cancelled) return
        setOrders(Array.isArray(data) ? data : [])
      } catch (e) {
        if (cancelled) return
        setOrders([])
        setError(e?.message || 'Failed to load orders')
      } finally {
        if (!cancelled) setLoading(false)
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
    const scheduleReload = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(async () => {
        try {
          setError('')
          const data = await getOrders()
          setOrders(Array.isArray(data) ? data : [])
        } catch (e) {
          setError(e?.message || 'Failed to load orders')
        }
      }, 350)
    }

    es.addEventListener('ordersChanged', scheduleReload)
    es.onerror = () => {
      // ignore; EventSource auto-reconnects
    }

    return () => {
      if (timer) window.clearTimeout(timer)
      es.close()
    }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Orders</h1>
        <p className="mt-1 text-sm text-slate-600">Track your placed orders and their status.</p>
      </header>

      <section className="w-full rounded-2xl bg-[#FDE68A]" aria-label="Orders list">
        <div className="px-5 py-6 sm:px-6 sm:py-7">
          {loading ? <p className="text-sm text-slate-600">Loading…</p> : null}
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

          {orders.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No orders yet.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {orders.map((order) => (
                <div key={order.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              {(() => {
                const ds = getDisplayStatus(order)
                return (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">Order #{String(order.id).slice(-6)}</div>
                      <div className="text-xs text-slate-600">{formatDate(order.createdAt)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-600">Status</div>
                      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(ds.tone)}`}>
                        <span aria-hidden="true">{ds.icon}</span>
                        <span>{ds.label}</span>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {String(order.status || '') === 'Rejected' && String(order.rejectionReason || '').trim() ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  <div className="font-semibold">Reason from admin</div>
                  <div className="mt-1">{order.rejectionReason}</div>
                </div>
              ) : null}

              <div className="mt-3 grid gap-1">
                {(order.items ?? []).map((item) => (
                  <div key={item.id ?? item.clientId ?? item.name} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0 truncate">{item.name}</div>
                    <div className="shrink-0 text-slate-700">
                      {formatPrice(item.price)} × {item.quantity}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
                <div className="text-slate-600">Items: {order.totalItems ?? 0}</div>
                <div className="font-semibold">Subtotal: {formatPrice(order.subtotal ?? 0)}</div>
              </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className="mt-5 rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-amber-50"
            onClick={() => navigate('/')}
          >
            Back to Home
          </button>
        </div>
      </section>
    </div>
  )
}
