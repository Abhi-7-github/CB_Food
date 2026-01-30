import { useEffect, useMemo, useRef, useState } from "react";
import { adminUpdateOrderStatus, getOrdersPage } from "../api/cbKareApi.js";

function fmtDate(value) {
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  } catch {
    return "";
  }
}

export default function AdminVerifyPayments({ adminKey }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState("Placed");
  const [teamNameFilter, setTeamNameFilter] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [nextCursor, setNextCursor] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const teamNameInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const page = await getOrdersPage({ limit: 200, adminKey });
      setOrders(page.orders);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(e?.message || "Failed to load orders");
      setOrders([]);
      setNextCursor("");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError("");
    try {
      const page = await getOrdersPage({
        cursor: nextCursor,
        limit: 200,
        adminKey,
      });
      setOrders((prev) => {
        const seen = new Set(prev.map((o) => String(o.id)));
        const merged = [...prev];
        for (const o of page.orders) {
          if (!seen.has(String(o.id))) merged.push(o);
        }
        return merged;
      });
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(e?.message || "Failed to load more orders");
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const key = String(adminKey ?? "").trim();
    if (!key) return undefined;

    const es = new EventSource(
      `/api/admin/stream?key=${encodeURIComponent(key)}`,
    );

    const onCreated = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (!data?.id) return;
        setOrders((prev) => {
          const id = String(data.id);
          const idx = prev.findIndex((o) => String(o.id) === id);
          if (idx === -1) return [data, ...prev];
          const next = [...prev];
          next[idx] = { ...next[idx], ...data };
          return next;
        });
      } catch {
        // ignore
      }
    };

    const onUpdated = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (!data?.id) return;
        setOrders((prev) => {
          const id = String(data.id);
          const idx = prev.findIndex((o) => String(o.id) === id);
          if (idx === -1) return prev;
          const current = prev[idx];
          const next = [...prev];
          next[idx] = {
            ...current,
            ...data,
            payment: {
              ...(current.payment || {}),
              ...(data.payment || {}),
            },
          };
          return next;
        });
      } catch {
        // ignore
      }
    };

    es.addEventListener("orderCreated", onCreated);
    es.addEventListener("orderUpdated", onUpdated);

    es.onerror = () => {
      // Avoid spamming errors; the user can still Refresh.
    };

    return () => {
      es.close();
    };
  }, [adminKey]);

  const filtered = useMemo(() => {
    const q = String(teamNameFilter || "")
      .trim()
      .toLowerCase();
    const base =
      statusFilter === "ALL"
        ? orders
        : orders.filter((o) => String(o.status || "") === statusFilter);
    if (!q) return base;
    return base.filter((o) =>
      String(o.team?.teamName || "")
        .toLowerCase()
        .includes(q),
    );
  }, [orders, statusFilter, teamNameFilter]);

  const setStatus = async (orderId, nextStatus) => {
    if (!adminKey || !String(adminKey).trim()) {
      setError("Admin key is required");
      return;
    }

    setUpdatingId(String(orderId));
    setError("");
    try {
      const updated = await adminUpdateOrderStatus({
        adminKey,
        orderId,
        status: nextStatus,
      });
      setOrders((prev) =>
        prev.map((o) =>
          String(o.id) === String(orderId) ? { ...o, ...updated } : o,
        ),
      );
    } catch (e) {
      setError(e?.message || "Failed to update order");
    } finally {
      setUpdatingId("");
    }
  };

  const rejectWithReason = async (orderId) => {
    if (!adminKey || !String(adminKey).trim()) {
      setError("Admin key is required");
      return;
    }

    const reason = window.prompt("Why are you rejecting this order?");
    if (!reason || !String(reason).trim()) {
      setError("Rejection reason is required");
      return;
    }

    setUpdatingId(String(orderId));
    setError("");
    try {
      const updated = await adminUpdateOrderStatus({
        adminKey,
        orderId,
        status: "Rejected",
        reason: String(reason).trim(),
      });
      setOrders((prev) =>
        prev.map((o) =>
          String(o.id) === String(orderId) ? { ...o, ...updated } : o,
        ),
      );
    } catch (e) {
      setError(e?.message || "Failed to reject order");
    } finally {
      setUpdatingId("");
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Verify Payments</div>
            <div className="text-xs text-slate-500">
              Review transaction IDs and payment screenshots
            </div>
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

            <input
              ref={teamNameInputRef}
              className="min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              value={teamNameFilter}
              onChange={(e) => setTeamNameFilter(e.target.value)}
              placeholder="Search team name…"
              aria-label="Search by team name"
            />

            {String(teamNameFilter || "").trim() ? (
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setTeamNameFilter("");
                  teamNameInputRef.current?.focus?.();
                }}
                title="Clear search"
                aria-label="Clear team name search"
              >
                ×
              </button>
            ) : null}

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
              title={!nextCursor ? "No more pages" : "Load next page"}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-600">Loading orders…</div>
      ) : null}

      {!loading && filtered.length === 0 ? (
        <div className="text-sm text-slate-600">No orders found.</div>
      ) : null}

      <div className="grid gap-3">
        {filtered.map((o) => {
          const id = String(o.id);
          const screenshotUrl = o.payment?.screenshotUrl;
          const transactionId = String(o.payment?.transactionId || "");
          const uploadStatus = String(o.payment?.uploadStatus || "");
          const uploadError = String(o.payment?.uploadError || "");
          const effectiveStatus =
            uploadStatus || (screenshotUrl ? "uploaded" : "");
          const canVerify = String(o.status || "") === "Placed";
          const canDeliver = String(o.status || "") === "Verified";
          const canReject = String(o.status || "") !== "Delivered";

          return (
            <div
              key={id}
              className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[240px]">
                  <div className="text-sm font-semibold">
                    {o.team?.teamName || "Team"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {fmtDate(o.createdAt)}
                  </div>
                  <div className="mt-2 text-sm text-slate-700">
                    <div>
                      <span className="font-medium">Leader:</span>{" "}
                      {o.team?.leaderName || "-"}
                    </div>
                    <div>
                      <span className="font-medium">Phone:</span>{" "}
                      {o.team?.phone || "-"}
                    </div>
                    <div>
                      <span className="font-medium">Email:</span>{" "}
                      {o.team?.email || "-"}
                    </div>
                  </div>
                </div>

                <div className="min-w-[240px]">
                  <div className="text-sm text-slate-700">
                    <div>
                      <span className="font-medium">Status:</span>{" "}
                      {o.status || "-"}
                    </div>
                    {o.status === "Rejected" && o.rejectionReason ? (
                      <div className="mt-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                        <span className="font-semibold">Rejected:</span>{" "}
                        {o.rejectionReason}
                      </div>
                    ) : null}
                    <div className="mt-1">
                      <span className="font-medium">Txn:</span>{" "}
                      {o.payment?.transactionId || "-"}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium">Items:</span>{" "}
                      {o.totalItems ?? "-"}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium">Subtotal:</span> ₹
                      {o.subtotal ?? "-"}
                    </div>
                  </div>

                  {o.items && o.items.length > 0 ? (
                    <div className="mt-3">
                      <div className="text-xs font-semibold text-slate-600 mb-2">
                        Items Ordered:
                      </div>
                      <div className="space-y-1 rounded-lg bg-slate-50 p-2">
                        {o.items.map((item, idx) => (
                          <div key={idx} className="text-xs text-slate-700">
                            <span className="font-medium">{item.name}</span> ×{" "}
                            {item.quantity} = ₹{item.price * item.quantity}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-xl bg-[#2BAD98] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      disabled={updatingId === id || !canVerify}
                      onClick={() => setStatus(id, "Verified")}
                    >
                      Mark Verified
                    </button>

                    <button
                      type="button"
                      className="rounded-xl bg-[#FF2D87] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      disabled={updatingId === id || !canDeliver}
                      onClick={() => setStatus(id, "Delivered")}
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
                  <div className="text-xs font-semibold text-slate-600">
                    Screenshot
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-slate-600">
                        Transaction ID
                      </div>
                      <div className="truncate text-xs font-medium text-slate-800">
                        {transactionId || "-"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-amber-50 disabled:opacity-60"
                      disabled={!transactionId}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(transactionId);
                        } catch {
                          // ignore
                        }
                      }}
                      title={
                        transactionId
                          ? "Copy transaction ID"
                          : "No transaction ID"
                      }
                    >
                      Copy
                    </button>
                  </div>

                  {effectiveStatus && effectiveStatus !== "uploaded" ? (
                    <div
                      className={
                        effectiveStatus === "pending"
                          ? "mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"
                          : "mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
                      }
                    >
                      {effectiveStatus === "pending"
                        ? "Uploading screenshot…"
                        : `Upload failed: ${uploadError || "Unknown error"}`}
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
                      <img
                        src={screenshotUrl}
                        alt="payment screenshot"
                        className="h-28 w-full object-cover"
                      />
                    </a>
                  ) : (
                    <div className="mt-2 text-sm text-slate-500">
                      {effectiveStatus === "pending"
                        ? "Waiting…"
                        : "No screenshot"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
