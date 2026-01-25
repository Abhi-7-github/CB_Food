import { useMemo, useState } from 'react'
import { adminCreateFood } from '../api/cbKareApi.js'

export default function AdminCreateFood({ adminKey, onFoodsChanged }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    isVeg: true,
    price: '',
    imageUrl: '',
    isActive: true,
  })

  const [imageFile, setImageFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canUseAdmin = useMemo(() => Boolean(adminKey && String(adminKey).trim()), [adminKey])

  const setField = (key, value) => {
    setForm((p) => ({ ...p, [key]: value }))
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!canUseAdmin) {
      setError('Admin key is required')
      return
    }

    const name = String(form.name ?? '').trim()
    const priceNum = Number(form.price)

    if (!name) return setError('name is required')
    if (!Number.isFinite(priceNum) || priceNum < 0) return setError('price must be a number >= 0')

    setSubmitting(true)
    try {
      const created = await adminCreateFood({
        adminKey,
        name,
        description: form.description,
        isVeg: Boolean(form.isVeg),
        price: priceNum,
        imageUrl: form.imageUrl,
        isActive: Boolean(form.isActive),
        imageFile,
      })

      setSuccess(`Food item created (id: ${created?.id || 'generated'})`)
      setForm({
        name: '',
        description: '',
        isVeg: true,
        price: '',
        imageUrl: '',
        isActive: true,
      })
      setImageFile(null)
      if (typeof onFoodsChanged === 'function') onFoodsChanged()
    } catch (err) {
      setError(err?.message || 'Failed to create food item')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      {error ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="mb-3 rounded-xl border border-[#2BAD98] bg-[#EAFBF7] px-3 py-2 text-sm text-slate-800">{success}</div>
      ) : null}

      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Name *</span>
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2BAD98]"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="Food name"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Description</span>
          <textarea
            className="min-h-[84px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2BAD98]"
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="Description"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium">Price *</span>
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2BAD98]"
              value={form.price}
              onChange={(e) => setField('price', e.target.value)}
              placeholder="e.g. 129"
              inputMode="decimal"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-medium">Type</span>
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.isVeg ? 'veg' : 'nonveg'}
              onChange={(e) => setField('isVeg', e.target.value === 'veg')}
            >
              <option value="veg">Veg</option>
              <option value="nonveg">Non-Veg</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium">Image Upload (optional)</span>
            <input
              className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
            {imageFile ? <div className="text-xs text-slate-600">Selected: {imageFile.name}</div> : null}
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-medium">Or Image URL (optional)</span>
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2BAD98]"
              value={form.imageUrl}
              onChange={(e) => setField('imageUrl', e.target.value)}
              placeholder="https://..."
            />
          </label>
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(form.isActive)} onChange={(e) => setField('isActive', e.target.checked)} />
          Active
        </label>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          className="rounded-xl bg-[#FF2D87] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={submitting}
        >
          {submitting ? 'Saving…' : 'Create Food Item'}
        </button>
      </div>
    </form>
  )
}
