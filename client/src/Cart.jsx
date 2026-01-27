import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

function formatPrice(value) {
  return `₹${value}`;
}

function clampMin0(value) {
  return Math.max(0, value);
}

export default function Cart({ foods = [], cart, setCart }) {
  const navigate = useNavigate();
  const cartItems = useMemo(() => {
    return foods
      .filter((item) => (cart[item.id] ?? 0) > 0)
      .map((item) => ({
        ...item,
        quantity: cart[item.id] ?? 0,
      }));
  }, [foods, cart]);

  const totalItems = useMemo(() => {
    return Object.values(cart).reduce((sum, n) => sum + n, 0);
  }, [cart]);

  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cartItems]);

  const addOne = (id) => {
    setCart((prev) => ({
      ...prev,
      [id]: (prev[id] ?? 0) + 1,
    }));
  };

  const hasInactive = useMemo(() => {
    return cartItems.some((it) => it?.isActive === false);
  }, [cartItems]);

  const removeOne = (id) => {
    setCart((prev) => {
      const nextQty = clampMin0((prev[id] ?? 0) - 1);
      if (nextQty === 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: nextQty };
    });
  };

  return (
    <div className="min-h-[70vh] grid place-items-start">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
        <div className="bg-[#FDE68A]">
          <div className="px-6 py-7 sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-800 ring-1 ring-amber-200">
                  Cart
                </div>
                <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
                  Your cart
                </h1>
                <p className="mt-2 text-sm text-slate-700">
                  Review your items before placing the order.
                </p>
              </div>

              <div className="grid gap-2 text-right">
                <div className="rounded-2xl bg-white/80 px-4 py-2 text-sm text-slate-800 ring-1 ring-amber-200">
                  <div className="text-xs text-slate-600">Items</div>
                  <div className="text-lg font-bold text-slate-900">
                    {totalItems}
                  </div>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-2 text-sm text-slate-800 ring-1 ring-amber-200">
                  <div className="text-xs text-slate-600">Subtotal</div>
                  <div className="text-lg font-bold text-slate-900">
                    {formatPrice(subtotal)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-7 sm:px-8">
          {cartItems.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">
                Your cart is empty
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Add items from the menu to place an order.
              </div>
              <button
                type="button"
                className="mt-4 rounded-xl bg-[#FF2D87] px-4 py-2.5 text-sm font-semibold text-white"
                onClick={() => navigate("/")}
              >
                Browse menu
              </button>
            </div>
          ) : (
            <>
              {hasInactive ? (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Some items are currently unavailable. Remove them to continue.
                </div>
              ) : null}

              <ul className="grid gap-3">
                {cartItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : null}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {item.name}
                        </div>
                        {item.isActive === false ? (
                          <div className="mt-1 inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            Unavailable
                          </div>
                        ) : null}
                        <div className="mt-1 text-xs text-slate-600">
                          {formatPrice(item.price)} × {item.quantity} ={" "}
                          <span className="font-semibold text-slate-900">
                            {formatPrice(item.price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 inline-flex items-center gap-2">
                      <button
                        type="button"
                        className={
                          "h-9 w-9 rounded-xl border text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50 " +
                          (item.isActive === false
                            ? "border-slate-200 bg-white text-slate-300"
                            : "border-[#2BAD98] bg-[#EAFBF7] text-[#2BAD98]")
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
                          "h-9 w-9 rounded-xl border text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50 " +
                          (item.isActive === false
                            ? "border-slate-200 bg-white text-slate-300"
                            : "border-[#2BAD98] bg-[#EAFBF7] text-[#2BAD98]")
                        }
                        onClick={() =>
                          item.isActive === false ? null : addOne(item.id)
                        }
                        disabled={item.isActive === false}
                        aria-label={`Add one ${item.name}`}
                      >
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => navigate("/")}
                >
                  Continue browsing
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-[#FF2D87] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={() => navigate("/order")}
                  disabled={hasInactive}
                >
                  Place order
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
