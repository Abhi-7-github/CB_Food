import { useEffect, useMemo, useState } from 'react'
import { adminGetAcceptedItemsSummary, getOrdersPage } from '../api/cbKareApi.js'

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[^\S\r\n]|[\r\n",]/.test(s)) return `"${s.replaceAll('"', '""')}"`
  return s
}

function buildCsv({ columns, rows }) {
  const header = columns.map(csvEscape).join(',')
  const body = rows
    .map((r) => columns.map((c) => csvEscape(r?.[c])).join(','))
    .join('\r\n')
  return `${header}\r\n${body}\r\n`
}

function downloadTextFile({ filename, text, mimeType }) {
  const blob = new Blob([text], { type: mimeType || 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function itemsSummary(items) {
  if (!Array.isArray(items) || items.length === 0) return ''
  return items
    .map((it) => {
      const name = String(it?.name || '').trim()
      const qty = Number(it?.quantity)
      const price = Number(it?.price)
      const qtyStr = Number.isFinite(qty) ? `x${qty}` : ''
      const priceStr = Number.isFinite(price) ? `@${price}` : ''
      return [name, qtyStr, priceStr].filter(Boolean).join(' ')
    })
    .filter(Boolean)
    .join(' | ')
}

function vegBadge(isVeg) {
  if (isVeg === true) return { label: 'Veg', cls: 'border-[#2BAD98] bg-[#EAFBF7] text-[#1F7A6B]' }
  if (isVeg === false) return { label: 'Non-Veg', cls: 'border-rose-200 bg-rose-50 text-rose-800' }
  return { label: '—', cls: 'border-slate-200 bg-slate-50 text-slate-700' }
}

export default function AdminAcceptedItemsPage({ adminKey }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [query, setQuery] = useState('')
  const [exporting, setExporting] = useState('')

  const load = async () => {
    const key = String(adminKey ?? '').trim()
    if (!key) {
      setError('Admin key is required')
      setData(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await adminGetAcceptedItemsSummary({ adminKey: key })
      setData(res)
    } catch (e) {
      setData(null)
      setError(e?.message || 'Failed to load accepted items')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey])

  useEffect(() => {
    const key = String(adminKey ?? '').trim()
    if (!key) return undefined

    const es = new EventSource(`/api/admin/stream?key=${encodeURIComponent(key)}`)

    let timer = null
    const scheduleReload = (ev) => {
      // Accepted-items summary changes only when an order status changes.
      // Ignore updates that only touch payment upload state.
      if (ev?.data) {
        try {
          const payload = JSON.parse(ev.data)
          const status = String(payload?.status || '')
          if (!status || status === 'Placed') return
        } catch {
          // If parsing fails, fall back to a safe refetch.
        }
      }

      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        load()
      }, 350)
    }

    es.addEventListener('orderUpdated', scheduleReload)

    es.onerror = () => {
      // ignore; manual refresh still works
    }

    return () => {
      if (timer) window.clearTimeout(timer)
      es.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey])

  const items = Array.isArray(data?.items) ? data.items : []
  const totals = data?.totals || {}
  const acceptedStatuses = Array.isArray(data?.acceptedStatuses) ? data.acceptedStatuses : ['Verified', 'Delivered']

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const hay = `${it.clientId || ''} ${it.name || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [items, query])

  const fetchAllOrdersForExport = async () => {
    const key = String(adminKey ?? '').trim()
    if (!key) throw new Error('Admin key is required')

    const all = []
    let cursor = ''
    const limit = 200
    const MAX_PAGES = 100

    for (let i = 0; i < MAX_PAGES; i += 1) {
      const page = await getOrdersPage({ cursor, limit, adminKey: key })
      if (Array.isArray(page.orders) && page.orders.length > 0) {
        all.push(...page.orders)
      }
      if (!page.nextCursor) break
      cursor = page.nextCursor
    }

    return all
  }

  const exportOrdersCsv = async ({ status, label }) => {
    setError('')
    setExporting(label)
    try {
      const allOrders = await fetchAllOrdersForExport()
      const selected = status === 'ALL' ? allOrders : allOrders.filter((o) => String(o.status || '') === status)

      const columns = [
        'Order ID',
        'Created At',
        'Status',
        'Team Name',
        'Leader Name',
        'Phone',
        'Email',
        'Transaction ID',
        'Subtotal',
        'Total Items',
        'Rejection Reason',
        'Items',
        'Screenshot URL',
      ]

      const rows = selected.map((o) => ({
        'Order ID': String(o.id ?? ''),
        'Created At': o.createdAt ? new Date(o.createdAt).toISOString() : '',
        Status: String(o.status ?? ''),
        'Team Name': String(o.team?.teamName ?? ''),
        'Leader Name': String(o.team?.leaderName ?? ''),
        Phone: String(o.team?.phone ?? ''),
        Email: String(o.team?.email ?? ''),
        'Transaction ID': String(o.payment?.transactionId ?? ''),
        Subtotal: o.subtotal ?? '',
        'Total Items': o.totalItems ?? '',
        'Rejection Reason': String(o.rejectionReason ?? ''),
        Items: itemsSummary(o.items),
        'Screenshot URL': String(o.payment?.screenshotUrl ?? ''),
      }))

      const csv = buildCsv({ columns, rows })
      const datePart = new Date().toISOString().slice(0, 10)
      const safeLabel = String(label || 'orders').toLowerCase().replace(/\s+/g, '-')
      downloadTextFile({
        filename: `payments-${safeLabel}-${datePart}.csv`,
        text: csv,
        mimeType: 'text/csv;charset=utf-8',
      })
    } catch (e) {
      setError(e?.message || 'Failed to export')
    } finally {
      setExporting('')
    }
  }

  const breakdown = useMemo(() => {
    let vegQty = 0
    let nonVegQty = 0
    for (const it of items) {
      const qty = Number(it?.quantity) || 0
      if (it?.isVeg === true) vegQty += qty
      else if (it?.isVeg === false) nonVegQty += qty
    }
    return { vegQty, nonVegQty }
  }, [items])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Accepted Items Summary</div>
          <div className="mt-1 text-xs text-slate-600">
            Counts from <span className="font-semibold">{acceptedStatuses.join(' / ')}</span> orders
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            className="w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2BAD98]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search item"
          />
          <button
            type="button"
            className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-amber-50 disabled:opacity-60"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-semibold text-slate-600">Accepted Orders</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{totals.acceptedOrders ?? 0}</div>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-semibold text-slate-600">Total Items Quantity</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{totals.totalQuantity ?? 0}</div>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-semibold text-slate-600">Veg / Non-Veg</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-[#2BAD98] bg-[#EAFBF7] px-3 py-1 text-xs font-semibold text-[#1F7A6B]">
              Veg: {breakdown.vegQty}
            </span>
            <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800">
              Non-Veg: {breakdown.nonVegQty}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-600">Download CSV</div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              onClick={() => exportOrdersCsv({ status: 'Verified', label: 'Accepted' })}
              disabled={loading || Boolean(exporting)}
              title="Download Accepted (Verified) orders"
            >
              {exporting === 'Accepted' ? 'Preparing…' : 'Accepted'}
            </button>

            <button
              type="button"
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              onClick={() => exportOrdersCsv({ status: 'Rejected', label: 'Rejected' })}
              disabled={loading || Boolean(exporting)}
              title="Download Rejected orders"
            >
              {exporting === 'Rejected' ? 'Preparing…' : 'Rejected'}
            </button>

            <button
              type="button"
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              onClick={() => exportOrdersCsv({ status: 'Delivered', label: 'Delivered' })}
              disabled={loading || Boolean(exporting)}
              title="Download Delivered orders"
            >
              {exporting === 'Delivered' ? 'Preparing…' : 'Delivered'}
            </button>

            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
              onClick={() => exportOrdersCsv({ status: 'ALL', label: 'All' })}
              disabled={loading || Boolean(exporting)}
              title="Download all orders"
            >
              {exporting === 'All' ? 'Preparing…' : 'All'}
            </button>
          </div>
        </div>

        {exporting ? <div className="mt-2 text-xs text-slate-500">Preparing {exporting} export…</div> : null}
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">Items</div>
          <div className="text-xs text-slate-600">Showing {filtered.length} / {items.length}</div>
        </div>

        {loading ? <div className="mt-3 text-sm text-slate-600">Loading…</div> : null}

        {!loading && filtered.length === 0 ? (
          <div className="mt-3 text-sm text-slate-600">No items found.</div>
        ) : null}

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[1fr_110px] bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            <div>Item</div>
            <div className="text-right">Quantity</div>
          </div>
          <div className="divide-y divide-slate-200">
            {filtered.map((it) => {
              const badge = vegBadge(it?.isVeg)
              return (
                <div key={it.clientId || it.name} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{it.name || it.clientId}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>
                      <span className="truncate text-[11px] text-slate-500">ID: {it.clientId}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-base font-bold text-slate-900">{it.quantity ?? 0}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-3 text-[11px] text-slate-500">Generated at: {data?.generatedAt || '-'}</div>
      </div>
    </div>
  )
}
