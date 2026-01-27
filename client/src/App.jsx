import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Cart from "./Cart.jsx";
import Home from "./Home.jsx";
import Navbar from "./Navbar.jsx";
import OrderPage from "./OrderPage.jsx";
import Orders from "./Orders.jsx";
import { getFoods } from "./api/cbKareApi.js";
import {
  clearStoredAuth,
  getStoredAuth,
  getUserData,
  putUserData,
} from "./api/cbKareApi.js";
import { useLocalStorageState } from "./hooks/useLocalStorageState.js";
import AdminPage from "./AdminPage.jsx";
import Login from "./Login.jsx";

const DEFAULT_ORDER_DRAFT = {
  teamName: "",
  leaderName: "",
  phone: "",
  email: "",
  transactionId: "",
};

const DUMMY_FOODS = [
  {
    id: "dummy-paneer-wrap",
    name: "Dummy Paneer Wrap",
    description: "Test item (frontend-only) to verify UI & ordering flow.",
    isVeg: true,
    price: 99,
    image: "https://placehold.co/96x96?text=Food",
    isActive: true,
  },
];

function App() {
  const location = useLocation();

  const [cart, setCart] = useLocalStorageState("cbkare.cart", {});
  const [orderDraft, setOrderDraft] = useLocalStorageState(
    "cbkare.orderDraft",
    DEFAULT_ORDER_DRAFT,
  );
  const [adminKey, setAdminKey] = useLocalStorageState("cbkare.adminKey", "");

  const [auth, setAuth] = useState(() => getStoredAuth());

  const isLoggedIn = Boolean(String(auth?.token || "").trim());
  const isLoginRoute = location.pathname === "/login";
  const isAdminRoute =
    location.pathname === "/admin" || location.pathname.startsWith("/admin/");

  const [foods, setFoods] = useState([]);
  const [foodsLoading, setFoodsLoading] = useState(true);
  const [foodsError, setFoodsError] = useState("");

  const effectiveFoods = useMemo(() => {
    if (foodsLoading || foodsError) return foods;
    if (Array.isArray(foods) && foods.length > 0) return foods;
    return import.meta.env.DEV ? DUMMY_FOODS : foods;
  }, [foods, foodsError, foodsLoading]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoggedIn) {
        setFoods([]);
        setFoodsLoading(false);
        setFoodsError("");
        return;
      }

      try {
        setFoodsLoading(true);
        setFoodsError("");
        const data = await getFoods();
        if (cancelled) return;
        setFoods(Array.isArray(data) ? data : []);
      } catch (e) {
        if (cancelled) return;
        setFoods([]);
        setFoodsError(e?.message || "Failed to load foods");
      } finally {
        if (!cancelled) setFoodsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  // When auth changes (login/logout), try to restore persisted user data.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!auth?.token) return;
      try {
        const ud = await getUserData();
        if (cancelled) return;
        const data = ud?.data && typeof ud.data === "object" ? ud.data : {};
        if (data.cart && typeof data.cart === "object") setCart(data.cart);
        if (data.orderDraft && typeof data.orderDraft === "object")
          setOrderDraft(data.orderDraft);
      } catch {
        // ignore; first-time user or temporarily unavailable
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, [auth?.token, setCart, setOrderDraft]);

  // Persist user data (no expiry) whenever cart/draft changes while logged in.
  useEffect(() => {
    if (!auth?.token) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        await putUserData({ cart: cart ?? {}, orderDraft: orderDraft ?? {} });
      } catch {
        // ignore
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [auth?.token, cart, orderDraft]);

  useEffect(() => {
    if (!isLoggedIn) return;

    const baseRaw = import.meta.env.VITE_API_BASE_URL;
    const base = typeof baseRaw === "string" ? baseRaw.replace(/\/$/, "") : "";
    const token = String(auth?.token || "");
    const urlBase = base ? `${base}/api/stream` : "/api/stream";
    const url = `${urlBase}?token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);

    let timer = null;
    const scheduleRefresh = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        refreshFoods();
      }, 300);
    };

    es.addEventListener("foodsChanged", scheduleRefresh);
    es.onerror = () => {
      // ignore; EventSource auto-reconnects
    };

    return () => {
      if (timer) window.clearTimeout(timer);
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, auth?.token]);

  const refreshFoods = async () => {
    try {
      setFoodsError("");
      const data = await getFoods();
      setFoods(Array.isArray(data) ? data : []);
    } catch (e) {
      setFoodsError(e?.message || "Failed to load foods");
    }
  };

  const cartCount = useMemo(() => {
    return Object.values(cart).reduce((sum, n) => sum + n, 0);
  }, [cart]);

  const isHomeRoute = location.pathname === "/";

  if (!isLoggedIn && !isLoginRoute && !isAdminRoute) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div
      className={
        "min-h-screen bg-white text-slate-900 flex flex-col " +
        (isHomeRoute ? "overflow-hidden" : "")
      }
    >
      <Navbar
        cartCount={cartCount}
        adminKey={adminKey}
        authUser={auth?.user}
        onLogout={() => {
          clearStoredAuth();
          setAuth(getStoredAuth());

          // Clear all user-visible data on logout.
          // (Login is optional; but if they logged in, we clear local cart/draft like Amazon.)
          setCart({});
          setOrderDraft(DEFAULT_ORDER_DRAFT);
        }}
      />

      <main
        className={
          "mx-auto w-full max-w-6xl flex-1 min-h-0 px-4 py-6 " +
          (isHomeRoute ? "overflow-hidden" : "")
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              isLoggedIn ? (
                <Home
                  foods={effectiveFoods}
                  foodsLoading={foodsLoading}
                  foodsError={foodsError}
                  cart={cart}
                  setCart={setCart}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/cart"
            element={
              isLoggedIn ? (
                <Cart foods={effectiveFoods} cart={cart} setCart={setCart} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/orders"
            element={
              isLoggedIn ? (
                <Orders auth={auth} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/order"
            element={
              isLoggedIn ? (
                <OrderPage
                  foods={effectiveFoods}
                  cart={cart}
                  setCart={setCart}
                  authToken={auth?.token || ""}
                  draft={orderDraft}
                  setDraft={setOrderDraft}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/login"
            element={
              <Login
                cart={cart}
                setCart={setCart}
                orderDraft={orderDraft}
                setOrderDraft={setOrderDraft}
                onAuthChanged={() => setAuth(getStoredAuth())}
              />
            }
          />
          <Route
            path="/admin/*"
            element={
              <AdminPage
                adminKey={adminKey}
                setAdminKey={setAdminKey}
                onFoodsChanged={isLoggedIn ? refreshFoods : undefined}
              />
            }
          />
          <Route
            path="*"
            element={
              <Navigate
                to={isLoggedIn || isAdminRoute ? "/" : "/login"}
                replace
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
