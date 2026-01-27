import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getOrders } from "./api/cbKareApi.js";

function formatPrice(value) {
  return `₹${value}`;
}

function formatDate(isoString) {
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

function getDisplayStatus(order) {
  const raw = String(order?.status || "Placed");
  if (raw === "Placed") return { label: "Pending", tone: "amber", icon: "…" };
  if (raw === "Verified")
    return { label: "Accepted", tone: "emerald", icon: "✓" };
  if (raw === "Delivered")
    return { label: "Delivered", tone: "sky", icon: "✓✓" };
  if (raw === "Rejected") return { label: "Rejected", tone: "rose", icon: "✕" };
  return { label: raw, tone: "slate", icon: "" };
}

function badgeClass(tone) {
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "emerald")
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "sky") return "border-sky-200 bg-sky-50 text-sky-800";
  if (tone === "rose") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function Orders({ auth }) {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const data = await getOrders();
        if (cancelled) return;
        setOrders(Array.isArray(data) ? data : []);
      } catch (e) {
        if (cancelled) return;
        setOrders([]);
        setError(e?.message || "Failed to load orders");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [auth?.token]);

  useEffect(() => {
    if (!auth?.token) return;

    const baseRaw = import.meta.env.VITE_API_BASE_URL;
    const base = typeof baseRaw === "string" ? baseRaw.replace(/\/$/, "") : "";
    const token = String(auth?.token || "");
    const urlBase = base ? `${base}/api/stream` : "/api/stream";
    const url = `${urlBase}?token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);

    const myAccountKey = String(auth?.user?.accountKey || "").trim();

    let timer = null;
    const scheduleReload = (ev) => {
      // If the server provides a clientUserId, only refetch for your own updates.
      // This prevents every connected user from hammering /api/orders on any update.
      if (ev?.data) {
        try {
          const payload = JSON.parse(ev.data);
          const targetAccountKey = String(payload?.accountKey || "");

          // If logged in, prefer accountKey matching.
          if (
            myAccountKey &&
            targetAccountKey &&
            targetAccountKey !== myAccountKey
          )
            return;

          // For status updates we can patch state without a refetch.
          if (
            String(payload?.action || "") === "statusUpdated" &&
            payload?.id
          ) {
            const id = String(payload.id);
            const nextStatus = String(payload?.status || "");
            const nextReason = String(payload?.rejectionReason || "");
            setOrders((prev) =>
              prev.map((o) =>
                String(o.id) === id
                  ? {
                      ...o,
                      status: nextStatus || o.status,
                      rejectionReason: nextReason,
                    }
                  : o,
              ),
            );
            return;
          }
        } catch {
          // ignore; fallback to refetch
        }
      }

      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        try {
          setError("");
          const data = await getOrders();
          setOrders(Array.isArray(data) ? data : []);
        } catch (e) {
          setError(e?.message || "Failed to load orders");
        }
      }, 350);
    };

    es.addEventListener("ordersChanged", scheduleReload);
    es.onerror = () => {
      // ignore; EventSource auto-reconnects
    };

    return () => {
      if (timer) window.clearTimeout(timer);
      es.close();
    };
  }, [auth?.token, auth?.user?.accountKey]);

  const summary = useMemo(() => {
    const out = {
      total: orders.length,
      pending: 0,
      accepted: 0,
      delivered: 0,
      rejected: 0,
    };

    for (const o of orders) {
      const raw = String(o?.status || "Placed");
      if (raw === "Placed") out.pending += 1;
      else if (raw === "Verified") out.accepted += 1;
      else if (raw === "Delivered") out.delivered += 1;
      else if (raw === "Rejected") out.rejected += 1;
    }

    return out;
  }, [orders]);

  return (
    <div className="min-h-[70vh] grid place-items-start">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
        <div className="bg-[#FDE68A]">
          <div className="px-6 py-7 sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-800 ring-1 ring-amber-200">
                  Orders
                </div>
                <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
                  Your orders
                </h1>
                <p className="mt-2 text-sm text-slate-700">
                  View your orders and their current status.
                </p>
              </div>

              <div className="grid gap-2">
                <div className="rounded-2xl bg-white/80 px-4 py-2 text-sm text-slate-800 ring-1 ring-amber-200">
                  <div className="text-xs text-slate-600">Total orders</div>
                  <div className="text-lg font-bold text-slate-900">
                    {summary.total}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass("amber")}`}
                  >
                    <span aria-hidden="true">…</span>
                    Pending: {summary.pending}
                  </span>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass("emerald")}`}
                  >
                    <span aria-hidden="true">✓</span>
                    Accepted: {summary.accepted}
                  </span>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass("sky")}`}
                  >
                    <span aria-hidden="true">✓✓</span>
                    Delivered: {summary.delivered}
                  </span>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass("rose")}`}
                  >
                    <span aria-hidden="true">✕</span>
                    Rejected: {summary.rejected}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-7 sm:px-8">
          {loading ? <p className="text-sm text-slate-600">Loading…</p> : null}
          {error ? (
            <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </p>
          ) : null}

          {orders.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">
                No orders yet
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Once you place an order, you’ll see updates here.
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
            <div className="mt-4 grid gap-3">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  {(() => {
                    const ds = getDisplayStatus(order);
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            Order #{String(order.id).slice(-6)}
                          </div>
                          <div className="text-xs text-slate-600">
                            {formatDate(order.createdAt)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-600">Status</div>
                          <div
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(ds.tone)}`}
                          >
                            <span aria-hidden="true">{ds.icon}</span>
                            <span>{ds.label}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {String(order.status || "") === "Rejected" &&
                  String(order.rejectionReason || "").trim() ? (
                    <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                      <div className="font-semibold">Reason</div>
                      <div className="mt-1">{order.rejectionReason}</div>
                    </div>
                  ) : null}

                  <div className="mt-3 grid gap-1">
                    {(order.items ?? []).map((item) => (
                      <div
                        key={item.id ?? item.clientId ?? item.name}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0 truncate text-slate-900">
                          {item.name}
                        </div>
                        <div className="shrink-0 text-slate-700">
                          {formatPrice(item.price)} × {item.quantity}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
                    <div className="text-slate-600">
                      Items: {order.totalItems ?? 0}
                    </div>
                    <div className="font-semibold text-slate-900">
                      Subtotal: {formatPrice(order.subtotal ?? 0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => navigate("/")}
            >
              Browse menu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
