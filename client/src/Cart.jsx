import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

function formatPrice(value) {
  return `₹${value}`
}

function clampMin0(value) {
  return Math.max(0, value)
}

export default function Cart({ foods = [], cart, setCart }) {
  const navigate = useNavigate()
  const cartItems = useMemo(() => {
    return foods.filter((item) => (cart[item.id] ?? 0) > 0).map((item) => ({
      ...item,
      quantity: cart[item.id] ?? 0,
    }))
  }, [foods, cart])

  const totalItems = useMemo(() => {
    return Object.values(cart).reduce((sum, n) => sum + n, 0)
  }, [cart])

  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }, [cartItems])

  const addOne = (id) => {
    setCart((prev) => ({
      ...prev,
      [id]: (prev[id] ?? 0) + 1,
    }))
  }

  const hasInactive = useMemo(() => {
    return cartItems.some((it) => it?.isActive === false)
  }, [cartItems])

  const removeOne = (id) => {
    setCart((prev) => {
      const nextQty = clampMin0((prev[id] ?? 0) - 1)
      if (nextQty === 0) {
        const { [id]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [id]: nextQty }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Cart</h1>
          <p className="mt-1 text-sm text-slate-600">Review items before placing an order.</p>
        </div>
        <div className="text-right text-sm text-slate-700">
          <div>Total items: <span className="font-semibold text-slate-900">{totalItems}</span></div>
          <div className="mt-1">
            <span className="text-slate-600">Subtotal: </span>
            <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700 ring-1 ring-rose-200">
              {formatPrice(subtotal)}
            </span>
          </div>
        </div>
      </header>

      <section className="w-full rounded-2xl bg-[#FDE68A]" aria-label="Cart items">
        <div className="px-5 py-6 sm:px-6 sm:py-7">
          {cartItems.length === 0 ? (
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm text-slate-700">Your cart is empty.</p>
              <button
                type="button"
                className="mt-3 rounded-xl bg-[#FF2D87] px-4 py-2 text-sm font-semibold text-white"
                onClick={() => navigate('/')}
              >
                Go to Home
              </button>
            </div>
          ) : (
            <>
              {hasInactive ? (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Some items are inactive and cannot be ordered. Remove them to continue.
                </div>
              ) : null}

              <ul className="grid gap-3">
                {cartItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{item.name}</div>
                      {item.isActive === false ? (
                        <div className="mt-1 inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          Inactive
                        </div>
                      ) : null}
                      <div className="mt-1 text-xs text-slate-600">
                        {formatPrice(item.price)} × {item.quantity} ={' '}
                        <span className="font-semibold text-slate-900">{formatPrice(item.price * item.quantity)}</span>
                      </div>
                    </div>

                    <div className="shrink-0 inline-flex items-center gap-2">
                      <button
                        type="button"
                        className={
                          'h-9 w-9 rounded-xl border text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50 ' +
                          (item.isActive === false
                            ? 'border-slate-200 bg-white text-slate-300'
                            : 'border-[#2BAD98] bg-[#EAFBF7] text-[#2BAD98]')
                        }
                        onClick={() => removeOne(item.id)}
                        disabled={item.isActive === false}
                        aria-label={`Remove one ${item.name}`}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className={
                          'h-9 w-9 rounded-xl border text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50 ' +
                          (item.isActive === false
                            ? 'border-slate-200 bg-white text-slate-300'
                            : 'border-[#2BAD98] bg-[#EAFBF7] text-[#2BAD98]')
                        }
                        onClick={() => (item.isActive === false ? null : addOne(item.id))}
                        disabled={item.isActive === false}
                        aria-label={`Add one ${item.name}`}
                      >
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                  onClick={() => navigate('/')}
                >
                  Continue Shopping
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-[#FF2D87] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={() => navigate('/order')}
                  disabled={hasInactive}
                >
                  Place Order
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
