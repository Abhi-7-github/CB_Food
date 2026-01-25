import { useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AdminCreateFood from './admin/AdminCreateFood.jsx'
import AdminAcceptedItemsPage from './admin/AdminAcceptedItemsPage.jsx'
import AdminManageFoods from './admin/AdminManageFoods.jsx'
import AdminVerifyPayments from './admin/AdminVerifyPayments.jsx'
import { adminPing } from './api/cbKareApi.js'

export default function AdminPage({ adminKey, setAdminKey, onFoodsChanged }) {
  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canUseAdmin = useMemo(() => Boolean(adminKey && adminKey.trim()), [adminKey])

  const login = async (e) => {
    e.preventDefault()
    const next = String(keyInput ?? '').trim()
    setError('')
    setSuccess('')
    if (!next) {
      setError('Admin key is required')
      return
    }

    try {
      await adminPing({ adminKey: next })
      setAdminKey(next)
      setKeyInput('')
    } catch (err) {
      setAdminKey('')
      setError(err?.message || 'Invalid admin key')
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Admin</h1>
          <p className="mt-1 text-sm text-slate-600">Anna Food Add chey</p>
        </div>
      </div>

      <section className="w-full rounded-2xl bg-[#FDE68A]" aria-label="Admin console">
        <div className="px-5 py-6 sm:px-6 sm:py-7">
      {!canUseAdmin ? (
        <form onSubmit={login} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="text-sm font-semibold">Enter Admin Key</div>
          <p className="mt-1 text-sm text-slate-600">This route is not shown to normal users.</p>

          {error ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="mt-4 grid gap-2">
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2BAD98]"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Admin key"
              type="password"
              autoComplete="off"
            />

            <div className="flex justify-end">
              <button type="submit" className="rounded-xl bg-[#FF2D87] px-4 py-2 text-sm font-semibold text-white">
                Continue
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="grid gap-4">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}
          {success ? (
            <div className="rounded-xl border border-[#2BAD98] bg-[#EAFBF7] px-3 py-2 text-sm text-slate-800">{success}</div>
          ) : null}

          <Routes>
            <Route index element={<Navigate to="foods" replace />} />
            <Route
              path="foods"
              element={<AdminCreateFood adminKey={adminKey} onFoodsChanged={onFoodsChanged} />}
            />
            <Route
              path="manage"
              element={<AdminManageFoods adminKey={adminKey} onFoodsChanged={onFoodsChanged} />}
            />
            <Route path="payments" element={<AdminVerifyPayments adminKey={adminKey} />} />
            <Route path="accepted" element={<AdminAcceptedItemsPage adminKey={adminKey} />} />
          </Routes>
        </div>
      )}
        </div>
      </section>
    </div>
  )
}
