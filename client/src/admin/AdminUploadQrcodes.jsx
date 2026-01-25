import { useEffect, useMemo, useState } from 'react'
import {
  adminDeletePaymentQr,
  adminGetPaymentQrs,
  adminSetPaymentQrActive,
  adminUploadPaymentQr,
} from '../api/cbKareApi.js'

function sortByCreatedDesc(list) {
  return [...list].sort((a, b) => {
    const da = new Date(a?.createdAt || 0).getTime()
    const db = new Date(b?.createdAt || 0).getTime()
    return db - da
  })
}

export default function AdminUploadQrcodes({ adminKey }) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])

  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')

  const load = async () => {
    const key = String(adminKey ?? '').trim()
    if (!key) {
      setError('Admin key is required')
      setItems([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const data = await adminGetPaymentQrs({ adminKey: key })
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e?.message || 'Failed to load QR codes')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey])

  useEffect(() => {
    if (!file) {
      setPreviewUrl('')
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const sorted = useMemo(() => sortByCreatedDesc(items), [items])
  const activeId = useMemo(() => sorted.find((q) => q?.isActive)?.id || '', [sorted])

  const canUploadMore = sorted.length < 4

  const upload = async (e) => {
    e.preventDefault()
    const key = String(adminKey ?? '').trim()
    if (!key) return setError('Admin key is required')
    if (!file) return setError('Please select a QR image')

    setSubmitting(true)
    setError('')
    try {
      await adminUploadPaymentQr({ adminKey: key, imageFile: file })
      setFile(null)
      await load()
    } catch (err) {
      setError(err?.message || 'Failed to upload QR')
    } finally {
      setSubmitting(false)
    }
  }

  const setActive = async (id, nextActive) => {
    const key = String(adminKey ?? '').trim()
    if (!key) return setError('Admin key is required')

    setSubmitting(true)
    setError('')
    try {
      await adminSetPaymentQrActive({ adminKey: key, id, active: Boolean(nextActive) })
      await load()
    } catch (err) {
      setError(err?.message || 'Failed to update active QR')
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async (id) => {
    const key = String(adminKey ?? '').trim()
    if (!key) return setError('Admin key is required')

    const ok = window.confirm('Delete this QR code?')
    if (!ok) return

    setSubmitting(true)
    setError('')
    try {
      await adminDeletePaymentQr({ adminKey: key, id })
      await load()
    } catch (err) {
      setError(err?.message || 'Failed to delete QR')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Upload QRCode</div>
          <div className="mt-1 text-xs text-slate-600">Add up to 4 QRs. Only one can be active at a time.</div>
        </div>

        <button
          type="button"
          className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-amber-50 disabled:opacity-60"
          onClick={load}
          disabled={loading || submitting}
        >
          Refresh
        </button>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {loading ? <div className="text-sm text-slate-600">Loading…</div> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {sorted.map((q) => {
          const id = String(q?.id || '')
          const isActive = Boolean(q?.isActive)
          return (
            <div key={id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">QR</div>
                  <div className="mt-1 text-xs text-slate-600">{id ? `ID: ${id.slice(-8)}` : ''}</div>
                </div>

                <span
                  className={
                    'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ' +
                    (isActive
                      ? 'border-[#2BAD98] bg-[#EAFBF7] text-[#1F7A6B]'
                      : 'border-slate-200 bg-slate-50 text-slate-700')
                  }
                >
                  {isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {q?.imageUrl ? (
                <img src={q.imageUrl} alt="Payment QR" className="mt-3 h-40 w-full rounded-xl border border-slate-200 object-contain" />
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800">
                  <span className="select-none">Active</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    onClick={() => setActive(id, !isActive)}
                    disabled={submitting}
                    className={
                      'relative inline-flex h-6 w-11 items-center rounded-full border transition disabled:opacity-60 ' +
                      (isActive ? 'border-[#2BAD98] bg-[#2BAD98]' : 'border-slate-300 bg-slate-200')
                    }
                    title={isActive ? 'Turn off' : 'Turn on (turns off others)'}
                  >
                    <span
                      className={
                        'inline-block h-5 w-5 transform rounded-full bg-white shadow transition ' +
                        (isActive ? 'translate-x-5' : 'translate-x-1')
                      }
                    />
                  </button>
                </label>

                <button
                  type="button"
                  className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  onClick={() => remove(id)}
                  disabled={submitting}
                >
                  Delete
                </button>
              </div>

              {activeId && activeId === id ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  This QR is currently shown to users for payment.
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-900">Add new QR</div>
            <div className="mt-1 text-xs text-slate-600">Slots: {sorted.length} / 4</div>
          </div>

          {!canUploadMore ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Max 4 reached. Delete one to add more.
            </div>
          ) : null}
        </div>

        {canUploadMore ? (
          <form onSubmit={upload} className="mt-3 grid gap-3">
            <input
              type="file"
              accept="image/*"
              className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={submitting}
            />

            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="h-40 w-full rounded-xl border border-slate-200 object-contain" />
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-xl bg-[#2BAD98] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={submitting}
              >
                {submitting ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  )
}
