import { useEffect, useMemo, useState } from 'react'
import { adminUpdateOrderStatus, getOrdersPage } from '../api/cbKareApi.js'

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[\r\n",]/.test(s)) return `"${s.replaceAll('"', '""')}"`
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

function fmtDate(value) {
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString()
  } catch {
    return ''
  }
}

export default function AdminVerifyPayments({ adminKey }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [orders, setOrders] = useState([])
  const [statusFilter, setStatusFilter] = useState('Placed')
  const [updatingId, setUpdatingId] = useState('')
  const [nextCursor, setNextCursor] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [exporting, setExporting] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const page = await getOrdersPage({ limit: 200, adminKey })
      setOrders(page.orders)
      setNextCursor(page.nextCursor)
    } catch (e) {
      setError(e?.message || 'Failed to load orders')
      setOrders([])
      setNextCursor('')
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    if (!nextCursor) return
    setLoadingMore(true)
    setError('')
    try {
      const page = await getOrdersPage({ cursor: nextCursor, limit: 200, adminKey })
      setOrders((prev) => {
        const seen = new Set(prev.map((o) => String(o.id)))
        const merged = [...prev]
        for (const o of page.orders) {
          if (!seen.has(String(o.id))) merged.push(o)
        }
        return merged
      })
      setNextCursor(page.nextCursor)
    } catch (e) {
      setError(e?.message || 'Failed to load more orders')
    } finally {
      setLoadingMore(false)
    }
  }

  const fetchAllOrdersForExport = async () => {
    if (!adminKey || !String(adminKey).trim()) {
      throw new Error('Admin key is required')
    }

    const all = []
    let cursor = ''
    const limit = 200
    const MAX_PAGES = 100

    for (let i = 0; i < MAX_PAGES; i += 1) {
      const page = await getOrdersPage({ cursor, limit, adminKey })
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
      const selected = status === 'ALL'
        ? allOrders
        : allOrders.filter((o) => String(o.status || '') === status)

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

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const key = String(adminKey ?? '').trim()
    if (!key) return undefined

    const es = new EventSource(`/api/admin/stream?key=${encodeURIComponent(key)}`)

    const onCreated = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        if (!data?.id) return
        setOrders((prev) => {
          const id = String(data.id)
          const idx = prev.findIndex((o) => String(o.id) === id)
          if (idx === -1) return [data, ...prev]
          const next = [...prev]
          next[idx] = { ...next[idx], ...data }
          return next
        })
      } catch {
        // ignore
      }
    }

    const onUpdated = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        if (!data?.id) return
        setOrders((prev) => {
          const id = String(data.id)
          const idx = prev.findIndex((o) => String(o.id) === id)
          if (idx === -1) return prev
          const current = prev[idx]
          const next = [...prev]
          next[idx] = {
            ...current,
            ...data,
            payment: {
              ...(current.payment || {}),
              ...(data.payment || {}),
            },
          }
          return next
        })
      } catch {
        // ignore
      }
    }

    es.addEventListener('orderCreated', onCreated)
    es.addEventListener('orderUpdated', onUpdated)

    es.onerror = () => {
      // Avoid spamming errors; the user can still Refresh.
    }

    return () => {
      es.close()
    }
  }, [adminKey])

  const filtered = useMemo(() => {
    if (statusFilter === 'ALL') return orders
    return orders.filter((o) => String(o.status || '') === statusFilter)
  }, [orders, statusFilter])

  const setStatus = async (orderId, nextStatus) => {
    if (!adminKey || !String(adminKey).trim()) {
      setError('Admin key is required')
      return
    }

    setUpdatingId(String(orderId))
    setError('')
    try {
      const updated = await adminUpdateOrderStatus({ adminKey, orderId, status: nextStatus })
      setOrders((prev) => prev.map((o) => (String(o.id) === String(orderId) ? { ...o, ...updated } : o)))
    } catch (e) {
      setError(e?.message || 'Failed to update order')
    } finally {
      setUpdatingId('')
    }
  }

  const rejectWithReason = async (orderId) => {
    if (!adminKey || !String(adminKey).trim()) {
      setError('Admin key is required')
      return
    }

    const reason = window.prompt('Why are you rejecting this order?')
    if (!reason || !String(reason).trim()) {
      setError('Rejection reason is required')
      return
    }

    setUpdatingId(String(orderId))
    setError('')
    try {
      const updated = await adminUpdateOrderStatus({
        adminKey,
        orderId,
        status: 'Rejected',
        reason: String(reason).trim(),
      })
      setOrders((prev) => prev.map((o) => (String(o.id) === String(orderId) ? { ...o, ...updated } : o)))
    } catch (e) {
      setError(e?.message || 'Failed to reject order')
    } finally {
      setUpdatingId('')
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Verify Payments</div>
            <div className="text-xs text-slate-500">Review transaction IDs and payment screenshots</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="Placed">Placed</option>
            <option value="Verified">Verified</option>
            <option value="Rejected">Rejected</option>
            <option value="Delivered">Delivered</option>
            <option value="ALL">All</option>
          </select>

          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </button>

          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
            onClick={loadMore}
            disabled={loading || loadingMore || !nextCursor}
            title={!nextCursor ? 'No more pages' : 'Load next page'}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
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
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? <div className="text-sm text-slate-600">Loading orders…</div> : null}

      {!loading && filtered.length === 0 ? <div className="text-sm text-slate-600">No orders found.</div> : null}

      <div className="grid gap-3">
        {filtered.map((o) => {
          const id = String(o.id)
          const screenshotUrl = o.payment?.screenshotUrl
          const transactionId = String(o.payment?.transactionId || '')
          const uploadStatus = String(o.payment?.uploadStatus || '')
          const uploadError = String(o.payment?.uploadError || '')
          const effectiveStatus = uploadStatus || (screenshotUrl ? 'uploaded' : '')
          const canVerify = String(o.status || '') === 'Placed'
          const canDeliver = String(o.status || '') === 'Verified'
          const canReject = String(o.status || '') !== 'Delivered'

          return (
            <div key={id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[240px]">
                  <div className="text-sm font-semibold">{o.team?.teamName || 'Team'}</div>
                  <div className="mt-1 text-xs text-slate-500">{fmtDate(o.createdAt)}</div>
                  <div className="mt-2 text-sm text-slate-700">
                    <div>
                      <span className="font-medium">Leader:</span> {o.team?.leaderName || '-'}
                    </div>
                    <div>
                      <span className="font-medium">Phone:</span> {o.team?.phone || '-'}
                    </div>
                    <div>
                      <span className="font-medium">Email:</span> {o.team?.email || '-'}
                    </div>
                  </div>
                </div>

                <div className="min-w-[240px]">
                  <div className="text-sm text-slate-700">
                    <div>
                      <span className="font-medium">Status:</span> {o.status || '-'}
                    </div>
                    {o.status === 'Rejected' && o.rejectionReason ? (
                      <div className="mt-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                        <span className="font-semibold">Rejected:</span> {o.rejectionReason}
                      </div>
                    ) : null}
                    <div className="mt-1">
                      <span className="font-medium">Txn:</span> {o.payment?.transactionId || '-'}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium">Items:</span> {o.totalItems ?? '-'}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium">Subtotal:</span> ₹{o.subtotal ?? '-'}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-xl bg-[#2BAD98] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      disabled={updatingId === id || !canVerify}
                      onClick={() => setStatus(id, 'Verified')}
                    >
                      Mark Verified
                    </button>

                    <button
                      type="button"
                      className="rounded-xl bg-[#FF2D87] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      disabled={updatingId === id || !canDeliver}
                      onClick={() => setStatus(id, 'Delivered')}
                      title="Mark delivery done"
                    >
                      Delivery Done
                    </button>

                    <button
                      type="button"
                      className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      disabled={updatingId === id || !canReject}
                      onClick={() => rejectWithReason(id)}
                    >
                      Reject
                    </button>
                  </div>
                </div>

                <div className="min-w-[180px]">
                  <div className="text-xs font-semibold text-slate-600">Screenshot</div>

                  <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-slate-600">Transaction ID</div>
                      <div className="truncate text-xs font-medium text-slate-800">{transactionId || '-'}</div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-amber-50 disabled:opacity-60"
                      disabled={!transactionId}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(transactionId)
                        } catch {
                          // ignore
                        }
                      }}
                      title={transactionId ? 'Copy transaction ID' : 'No transaction ID'}
                    >
                      Copy
                    </button>
                  </div>

                  {effectiveStatus && effectiveStatus !== 'uploaded' ? (
                    <div
                      className={
                        effectiveStatus === 'pending'
                          ? 'mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800'
                          : 'mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700'
                      }
                    >
                      {effectiveStatus === 'pending' ? 'Uploading screenshot…' : `Upload failed: ${uploadError || 'Unknown error'}`}
                    </div>
                  ) : null}
                  {screenshotUrl ? (
                    <a
                      href={screenshotUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block overflow-hidden rounded-xl border border-slate-200"
                      title="Open screenshot"
                    >
                      <img src={screenshotUrl} alt="payment screenshot" className="h-28 w-full object-cover" />
                    </a>
                  ) : (
                    <div className="mt-2 text-sm text-slate-500">{effectiveStatus === 'pending' ? 'Waiting…' : 'No screenshot'}</div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
