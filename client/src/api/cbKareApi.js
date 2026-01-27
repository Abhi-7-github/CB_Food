const RAW_BASE = import.meta.env.VITE_API_BASE_URL;

const API_BASE =
  typeof RAW_BASE === "string" ? RAW_BASE.replace(/\/$/, "") : "";

const CLIENT_USER_ID_KEY = "cbkare.userId";
const AUTH_TOKEN_KEY = "cbkare.authToken";
const AUTH_USER_KEY = "cbkare.authUser";

function getClientUserId() {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.localStorage.getItem(CLIENT_USER_ID_KEY);
    if (typeof existing === "string" && existing.trim()) return existing;

    const next =
      window.crypto && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    window.localStorage.setItem(CLIENT_USER_ID_KEY, next);
    return next;
  } catch {
    return "";
  }
}

export function getOrCreateClientUserId() {
  return getClientUserId();
}

function getAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    return typeof token === "string" ? token : "";
  } catch {
    return "";
  }
}

export function getStoredAuth() {
  if (typeof window === "undefined") return { token: "", user: null };
  try {
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
    const userRaw = window.localStorage.getItem(AUTH_USER_KEY);
    const user = userRaw ? JSON.parse(userRaw) : null;
    return {
      token: typeof token === "string" ? token : "",
      user: user && typeof user === "object" ? user : null,
    };
  } catch {
    return { token: "", user: null };
  }
}

export function storeAuth({ token, user }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTH_TOKEN_KEY, String(token ?? ""));
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user ?? null));
  } catch {
    // ignore
  }
}

export function clearStoredAuth() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USER_KEY);
  } catch {
    // ignore
  }
}

function buildUrl(path) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

function normalizeErrorMessage(message) {
  const msg = String(message || "").trim();
  const lower = msg.toLowerCase();

  if (!msg) return "Something went wrong. Please try again.";
  if (msg.includes("x-client-user-id"))
    return "Please refresh the page and try again.";
  if (msg === "Invalid credentials") return "Incorrect team name or password.";
  if (lower.includes("incorrect team name"))
    return "Incorrect team name or password.";
  if (lower.includes("login required") || lower.includes("sign in"))
    return "Session expired. Please sign in again.";

  return msg;
}

async function apiFetch(path, options) {
  const url = buildUrl(path);
  const res = await fetch(url, options);

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");

  if (!res.ok) {
    const msg =
      body && typeof body === "object" && body.error
        ? body.error
        : `Request failed (${res.status})`;
    const err = new Error(normalizeErrorMessage(msg));
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

export async function getFoods() {
  const token = getAuthToken();
  return apiFetch("/api/foods", {
    method: "GET",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
}

export async function getOrders() {
  const page = await getOrdersPage({});
  return page.orders;
}

export async function getOrdersPage({ cursor, limit, adminKey } = {}) {
  const qs = new URLSearchParams();
  if (typeof cursor === "string" && cursor.trim())
    qs.set("cursor", cursor.trim());
  if (Number.isFinite(Number(limit))) qs.set("limit", String(Number(limit)));

  const query = qs.toString();
  const url = buildUrl(`/api/orders${query ? `?${query}` : ""}`);

  const headers = {};
  const admin = typeof adminKey === "string" ? adminKey.trim() : "";
  if (admin) {
    headers["x-admin-key"] = admin;
  } else {
    const token = getAuthToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");

  if (!res.ok) {
    const msg =
      body && typeof body === "object" && body.error
        ? body.error
        : `Request failed (${res.status})`;
    const err = new Error(normalizeErrorMessage(msg));
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return {
    orders: Array.isArray(body) ? body : [],
    nextCursor: res.headers.get("x-next-cursor") || "",
  };
}

export async function createOrder({
  teamName,
  leaderName,
  phone,
  email,
  transactionId,
  items,
  subtotal,
  totalItems,
  paymentScreenshotFile,
}) {
  const fd = new FormData();
  fd.append("teamName", String(teamName ?? ""));
  fd.append("leaderName", String(leaderName ?? ""));
  fd.append("phone", String(phone ?? ""));
  fd.append("email", String(email ?? ""));
  fd.append("transactionId", String(transactionId ?? ""));
  fd.append("items", JSON.stringify(items ?? []));
  fd.append("subtotal", String(subtotal ?? 0));
  fd.append("totalItems", String(totalItems ?? 0));

  if (paymentScreenshotFile) {
    fd.append("paymentScreenshot", paymentScreenshotFile);
  }

  return apiFetch("/api/orders", {
    method: "POST",
    headers: {
      ...(getAuthToken() ? { authorization: `Bearer ${getAuthToken()}` } : {}),
    },
    body: fd,
  });
}

export async function checkTransactionIdAvailability(transactionId) {
  const qs = new URLSearchParams();
  qs.set("transactionId", String(transactionId ?? "").trim());
  return apiFetch(`/api/orders/transaction-id-available?${qs.toString()}`);
}

export async function adminCreateFood({
  adminKey,
  clientId,
  name,
  description,
  isVeg,
  price,
  imageUrl,
  isActive,
  imageFile,
}) {
  const fd = new FormData();
  if (typeof clientId === "string" && clientId.trim())
    fd.append("clientId", clientId.trim());
  fd.append("name", String(name ?? ""));
  fd.append("description", String(description ?? ""));
  fd.append("isVeg", String(Boolean(isVeg)));
  fd.append("price", String(price ?? ""));
  if (typeof imageUrl === "string" && imageUrl.trim())
    fd.append("imageUrl", imageUrl.trim());
  if (typeof isActive === "boolean") fd.append("isActive", String(isActive));
  if (imageFile) fd.append("image", imageFile);

  return apiFetch("/api/admin/foods", {
    method: "POST",
    headers: {
      "x-admin-key": String(adminKey ?? ""),
    },
    body: fd,
  });
}

export async function adminUpdateOrderStatus({
  adminKey,
  orderId,
  status,
  reason,
}) {
  return apiFetch(
    `/api/admin/orders/${encodeURIComponent(String(orderId))}/status`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-admin-key": String(adminKey ?? ""),
      },
      body: JSON.stringify({
        status: String(status ?? ""),
        ...(typeof reason === "string" && reason.trim()
          ? { reason: reason.trim() }
          : {}),
      }),
    },
  );
}

export async function adminGetFoods({ adminKey }) {
  return apiFetch("/api/admin/foods", {
    method: "GET",
    headers: {
      "x-admin-key": String(adminKey ?? ""),
    },
  });
}

export async function adminUpdateFood({
  adminKey,
  id,
  name,
  description,
  isVeg,
  price,
  imageUrl,
  isActive,
  imageFile,
}) {
  const hasFile = Boolean(imageFile);

  if (hasFile) {
    const fd = new FormData();
    if (name !== undefined) fd.append("name", String(name ?? ""));
    if (description !== undefined)
      fd.append("description", String(description ?? ""));
    if (isVeg !== undefined) fd.append("isVeg", String(Boolean(isVeg)));
    if (price !== undefined) fd.append("price", String(price ?? ""));
    if (imageUrl !== undefined) fd.append("imageUrl", String(imageUrl ?? ""));
    if (typeof isActive === "boolean") fd.append("isActive", String(isActive));
    fd.append("image", imageFile);

    return apiFetch(`/api/admin/foods/${encodeURIComponent(String(id))}`, {
      method: "PATCH",
      headers: {
        "x-admin-key": String(adminKey ?? ""),
      },
      body: fd,
    });
  }

  return apiFetch(`/api/admin/foods/${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-admin-key": String(adminKey ?? ""),
    },
    body: JSON.stringify({
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(isVeg !== undefined ? { isVeg } : {}),
      ...(price !== undefined ? { price } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(typeof isActive === "boolean" ? { isActive } : {}),
    }),
  });
}

export async function adminDeleteFood({ adminKey, id }) {
  return apiFetch(`/api/admin/foods/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
    headers: {
      "x-admin-key": String(adminKey ?? ""),
    },
  });
}

export async function adminPing({ adminKey }) {
  return apiFetch("/api/admin/ping", {
    method: "GET",
    headers: {
      "x-admin-key": String(adminKey ?? ""),
    },
  });
}

export async function adminGetAcceptedItemsSummary({ adminKey }) {
  return apiFetch("/api/admin/summary/accepted-items", {
    method: "GET",
    headers: {
      "x-admin-key": String(adminKey ?? ""),
    },
  });
}

export async function getActivePaymentQr() {
  const token = getAuthToken();
  return apiFetch("/api/payment-qrs/active", {
    method: "GET",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
}

export async function loginUser({ teamName, password }) {
  return apiFetch("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      teamName: String(teamName ?? ""),
      password: String(password ?? ""),
    }),
  });
}

export async function getUserData() {
  const token = getAuthToken();
  if (!token) throw new Error("Login required");
  return apiFetch("/api/user/data", {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}

export async function putUserData(data) {
  const token = getAuthToken();
  if (!token) throw new Error("Login required");
  return apiFetch("/api/user/data", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data }),
  });
}

export async function adminGetPaymentQrs({ adminKey }) {
  return apiFetch("/api/admin/payment-qrs", {
    method: "GET",
    headers: {
      "x-admin-key": String(adminKey ?? ""),
    },
  });
}

export async function adminUploadPaymentQr({ adminKey, imageFile }) {
  const fd = new FormData();
  if (imageFile) fd.append("image", imageFile);

  return apiFetch("/api/admin/payment-qrs", {
    method: "POST",
    headers: {
      "x-admin-key": String(adminKey ?? ""),
    },
    body: fd,
  });
}

export async function adminSetPaymentQrActive({ adminKey, id, active }) {
  return apiFetch(
    `/api/admin/payment-qrs/${encodeURIComponent(String(id))}/active`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-admin-key": String(adminKey ?? ""),
      },
      body: JSON.stringify({ active: Boolean(active) }),
    },
  );
}

export async function adminDeletePaymentQr({ adminKey, id }) {
  return apiFetch(`/api/admin/payment-qrs/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
    headers: {
      "x-admin-key": String(adminKey ?? ""),
    },
  });
}
