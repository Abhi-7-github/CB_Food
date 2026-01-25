import React from 'react'

function formatMoney(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return `₹${n}`
}

function VegMark({ isVeg }) {
  const tone = isVeg ? 'border-emerald-500 text-emerald-600' : 'border-red-500 text-red-600'
  const dot = isVeg ? 'bg-emerald-500' : 'bg-red-500'
  return (
    <span className={"inline-grid h-5 w-5 place-items-center rounded-[6px] border bg-white " + tone} aria-label={isVeg ? 'Veg' : 'Non-veg'}>
      <span className={"h-2.5 w-2.5 rounded-full " + dot} aria-hidden="true" />
    </span>
  )
}

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.92 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l7.08-1.01L12 2z" />
    </svg>
  )
}

export default function FoodCard({ food, quantity = 0, onIncrease, onDecrease }) {
  const isVeg = Boolean(food?.isVeg)
  const active = food?.isActive !== false

  const rating = Number(food?.rating)
  const ratingsCount = Number(food?.ratingsCount)
  const hasRating = Number.isFinite(rating) && rating > 0

  const price = Number(food?.price)
  const originalPrice = Number(food?.originalPrice)
  const hasDiscount = Number.isFinite(originalPrice) && Number.isFinite(price) && originalPrice > price

  const isBestseller = Boolean(food?.isBestseller)

  return (
    <article
      className={
        'group flex items-stretch justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition ' +
        'md:hover:-translate-y-0.5 md:hover:shadow-md ' +
        (!active ? 'opacity-70' : '')
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <VegMark isVeg={isVeg} />
            {isBestseller ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Bestseller</span>
            ) : null}
          </div>

          {!active ? (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">Inactive</span>
          ) : null}
        </div>

        <h3 className="mt-2 text-[15px] font-semibold leading-snug text-slate-900 md:text-base">{food?.name}</h3>

        {food?.description ? (
          <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-slate-500">{food.description}</p>
        ) : null}

        {hasRating ? (
          <div className="mt-2 inline-flex items-center gap-2 text-[12px] text-slate-600">
            <span className="inline-flex items-center gap-1 text-amber-500">
              <StarIcon />
            </span>
            <span className="font-semibold text-slate-800">{rating.toFixed(1)}</span>
            <span className="text-slate-500">({Number.isFinite(ratingsCount) ? ratingsCount : 0} ratings)</span>
          </div>
        ) : null}

        <div className="mt-2 flex items-end gap-2">
          <div className="text-[14px] font-semibold text-slate-900 md:text-[15px]">{formatMoney(price)}</div>
          {hasDiscount ? (
            <div className="text-[12px] text-slate-400 line-through">{formatMoney(originalPrice)}</div>
          ) : null}
        </div>
      </div>

      <div className="relative w-32 shrink-0 pb-4">
        <div className="aspect-square w-full overflow-hidden rounded-2xl bg-slate-100 shadow-sm">
          <img
            className="h-full w-full translate-x-[6px] -translate-y-[6px] object-cover"
            src={food?.image}
            alt={food?.name || 'Food'}
            loading="lazy"
          />
        </div>

        <div
          className={
            'absolute bottom-0 left-1/2 inline-flex -translate-x-1/2 items-center overflow-hidden rounded-xl shadow-md ' +
            (active ? 'bg-[#2BAD98] text-white' : 'bg-slate-300 text-white')
          }
        >
          <button
            type="button"
            className="h-9 w-9 text-base font-semibold disabled:cursor-not-allowed"
            onClick={onDecrease}
            disabled={!active || quantity === 0}
            aria-label={`Decrease quantity for ${food?.name}`}
          >
            −
          </button>
          <div className="w-10 text-center text-sm font-semibold" aria-live="polite">
            {quantity}
          </div>
          <button
            type="button"
            className="h-9 w-9 text-base font-semibold disabled:cursor-not-allowed"
            onClick={onIncrease}
            disabled={!active}
            aria-label={`Increase quantity for ${food?.name}`}
          >
            +
          </button>
        </div>
      </div>
    </article>
  )
}
