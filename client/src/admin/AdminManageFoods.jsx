import { useEffect, useMemo, useState } from 'react'
import { adminDeleteFood, adminGetFoods, adminUpdateFood } from '../api/cbKareApi.js'

function typeLabel(isVeg) {
  return isVeg ? 'Veg' : 'Non-Veg'
}

export default function AdminManageFoods({ adminKey, onFoodsChanged }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [foods, setFoods] = useState([])
  const [query, setQuery] = useState('')

  const [editingId, setEditingId] = useState('')
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    isVeg: true,
    price: '',
    imageUrl: '',
    isActive: true,
  })
  const [editImageFile, setEditImageFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const key = String(adminKey ?? '').trim()
    if (!key) {
      setError('Admin key is required')
      setFoods([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const data = await adminGetFoods({ adminKey: key })
      setFoods(Array.isArray(data) ? data : [])
    } catch (e) {
      setFoods([])
      setError(e?.message || 'Failed to load foods')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey])

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return foods
    return foods.filter((f) => {
      const hay = `${f.id} ${f.name} ${f.description}`.toLowerCase()
      return hay.includes(q)
    })
  }, [foods, query])

  const startEdit = (f) => {
    setEditingId(String(f.id))
    setEditForm({
      name: f.name || '',
      description: f.description || '',
      isVeg: Boolean(f.isVeg),
      price: String(f.price ?? ''),
      imageUrl: f.image || '',
      isActive: Boolean(f.isActive),
    })
    setEditImageFile(null)
    setError('')
  }

  const cancelEdit = () => {
    setEditingId('')
    setEditImageFile(null)
  }

  const saveEdit = async () => {
    const key = String(adminKey ?? '').trim()
    if (!key) {
      setError('Admin key is required')
      return
    }

    const id = String(editingId)
    if (!id) return

    const name = String(editForm.name ?? '').trim()
    const priceNum = Number(editForm.price)

    if (!name) {
      setError('Name is required')
      return
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError('Price must be a number >= 0')
      return
    }

    setSaving(true)
    setError('')
    try {
      const updated = await adminUpdateFood({
        adminKey: key,
        id,
        name,
        description: editForm.description,
        isVeg: Boolean(editForm.isVeg),
        price: priceNum,
        imageUrl: editForm.imageUrl,
        isActive: Boolean(editForm.isActive),
        imageFile: editImageFile,
      })

      setFoods((prev) => prev.map((f) => (String(f.id) === id ? { ...f, ...updated } : f)))
      setEditingId('')
      setEditImageFile(null)
      if (typeof onFoodsChanged === 'function') onFoodsChanged()
    } catch (e) {
      setError(e?.message || 'Failed to update food')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    const key = String(adminKey ?? '').trim()
    if (!key) {
      setError('Admin key is required')
      return
    }

    const ok = window.confirm('Delete this food item?')
    if (!ok) return

    setError('')
    try {
      await adminDeleteFood({ adminKey: key, id })
      setFoods((prev) => prev.filter((f) => String(f.id) !== String(id)))
      if (typeof onFoodsChanged === 'function') onFoodsChanged()
    } catch (e) {
      setError(e?.message || 'Failed to delete food')
    }
  }

  const toggleActive = async (id, nextActive) => {
    const key = String(adminKey ?? '').trim()
    if (!key) {
      setError('Admin key is required')
      return
    }

    setError('')
    try {
      const updated = await adminUpdateFood({ adminKey: key, id, isActive: Boolean(nextActive) })
      setFoods((prev) => prev.map((f) => (String(f.id) === String(id) ? { ...f, ...updated } : f)))
      if (typeof onFoodsChanged === 'function') onFoodsChanged()
    } catch (e) {
      setError(e?.message || 'Failed to update active status')
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Manage Foods</div>
          <div className="text-xs text-slate-500">Edit / delete items (including inactive)</div>
        </div>

        <div className="flex items-center gap-2">
          <input
            className="w-48 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
          />

          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
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

      {loading ? <div className="text-sm text-slate-600">Loading foods…</div> : null}

      {!loading && filtered.length === 0 ? <div className="text-sm text-slate-600">No foods found.</div> : null}

      <div className="grid gap-3">
        {filtered.map((f) => {
          const id = String(f.id)
          const isEditing = id === String(editingId)

          return (
            <div key={id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              {!isEditing ? (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[240px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold">{f.name}</div>
                      <span
                        className={
                          f.isVeg
                            ? 'inline-flex items-center rounded-full border border-[#2BAD98] bg-[#EAFBF7] px-2 py-0.5 text-[11px] font-semibold text-[#1F7A6B]'
                            : 'inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800'
                        }
                      >
                        {typeLabel(f.isVeg)}
                      </span>
                      {!f.isActive ? (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          Inactive
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">ID: {id}</div>
                    {f.description ? <div className="mt-2 text-sm text-slate-700">{f.description}</div> : null}
                  </div>

                  <div className="min-w-[200px] text-sm text-slate-700">
                    <div>
                      <span className="font-medium">Price:</span> ₹{f.price}
                    </div>
                    {f.image ? (
                      <a className="mt-2 inline-block text-xs text-[#2BAD98] underline" href={f.image} target="_blank" rel="noreferrer">
                        View Image
                      </a>
                    ) : (
                      <div className="mt-2 text-xs text-slate-500">No Image</div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-xl bg-[#2BAD98] px-3 py-2 text-xs font-semibold text-white"
                        onClick={() => startEdit(f)}
                      >
                        Edit
                      </button>

                      <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800">
                        <span className="select-none">{f.isActive ? 'Active' : 'Inactive'}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={Boolean(f.isActive)}
                          onClick={() => toggleActive(id, !f.isActive)}
                          className={
                            'relative inline-flex h-6 w-11 items-center rounded-full border transition ' +
                            (f.isActive ? 'border-[#2BAD98] bg-[#2BAD98]' : 'border-slate-300 bg-slate-200')
                          }
                          title={f.isActive ? 'Set inactive' : 'Set active'}
                        >
                          <span
                            className={
                              'inline-block h-5 w-5 transform rounded-full bg-white shadow transition ' +
                              (f.isActive ? 'translate-x-5' : 'translate-x-1')
                            }
                          />
                        </button>
                      </label>

                      <button
                        type="button"
                        className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white"
                        onClick={() => remove(id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">Edit: {id}</div>
                      <div className="text-xs text-slate-500">Update fields and Save</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="rounded-xl bg-[#2BAD98] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                        onClick={saveEdit}
                        disabled={saving}
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-sm font-medium">Name *</span>
                      <input
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2BAD98]"
                        value={editForm.name}
                        onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                      />
                    </label>

                    <label className="grid gap-1">
                      <span className="text-sm font-medium">Price *</span>
                      <input
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2BAD98]"
                        value={editForm.price}
                        onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))}
                        inputMode="decimal"
                      />
                    </label>
                  </div>

                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Description</span>
                    <textarea
                      className="min-h-[84px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2BAD98]"
                      value={editForm.description}
                      onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-sm font-medium">Type</span>
                      <select
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={editForm.isVeg ? 'veg' : 'nonveg'}
                        onChange={(e) => setEditForm((p) => ({ ...p, isVeg: e.target.value === 'veg' }))}
                      >
                        <option value="veg">Veg</option>
                        <option value="nonveg">Non-Veg</option>
                      </select>
                    </label>

                    <label className="grid gap-1">
                      <span className="text-sm font-medium">Active</span>
                      <select
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={editForm.isActive ? 'true' : 'false'}
                        onChange={(e) => setEditForm((p) => ({ ...p, isActive: e.target.value === 'true' }))}
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-sm font-medium">New Image Upload (optional)</span>
                      <input
                        className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        type="file"
                        accept="image/*"
                        onChange={(e) => setEditImageFile(e.target.files?.[0] ?? null)}
                      />
                      {editImageFile ? <div className="text-xs text-slate-600">Selected: {editImageFile.name}</div> : null}
                    </label>

                    <label className="grid gap-1">
                      <span className="text-sm font-medium">Or Image URL (optional)</span>
                      <input
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                        value={editForm.imageUrl}
                        onChange={(e) => setEditForm((p) => ({ ...p, imageUrl: e.target.value }))}
                        placeholder="https://..."
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
