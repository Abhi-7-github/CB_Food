import React, { useMemo, useState } from 'react'
import FoodCard from './FoodCard'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'bestseller', label: 'Bestseller' },
]

function matchesFilter(food, filterKey) {
  if (filterKey === 'all') return true
  if (filterKey === 'bestseller') {
    if (Boolean(food?.isBestseller)) return true
    const orderedByCount = Number(food?.orderedByCount)
    const orderedQty = Number(food?.orderedQty)
    return (Number.isFinite(orderedByCount) && orderedByCount > 0) || (Number.isFinite(orderedQty) && orderedQty > 0)
  }
  return true
}

export default function FoodList({ foods, cart, onIncrease, onDecrease }) {
  const [activeFilter, setActiveFilter] = useState('all')

  const filteredFoods = useMemo(() => {
    const list = Array.isArray(foods) ? foods : []
    return list.filter((f) => matchesFilter(f, activeFilter))
  }, [foods, activeFilter])

  return (
    <div className="min-h-0">
      <div className="sticky top-0 z-10 -mx-5 bg-[#FDE68A] px-5 py-3 sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2 overflow-x-auto">
          {FILTERS.map((f) => {
            const isActive = activeFilter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setActiveFilter(f.key)}
                className={
                  'shrink-0 rounded-full border px-4 py-2 text-[12px] font-semibold transition ' +
                  (isActive
                    ? 'border-[#FF2D87] bg-[#FF2D87] text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-[#FF2D87]')
                }
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filteredFoods.map((food) => (
          <FoodCard
            key={food.id}
            food={food}
            quantity={Number(cart?.[food.id] || 0)}
            onIncrease={() => onIncrease(food.id)}
            onDecrease={() => onDecrease(food.id)}
          />
        ))}

        {filteredFoods.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
            No items found for this filter.
          </div>
        ) : null}
      </div>
    </div>
  )
}
