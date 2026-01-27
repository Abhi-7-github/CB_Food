import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearStoredAuth,
  getStoredAuth,
  getUserData,
  loginUser,
  putUserData,
  storeAuth,
} from "./api/cbKareApi.js";

function safeObj(value) {
  return value && typeof value === "object" ? value : null;
}

function statusBoxClass(state) {
  if (state === "error") return "border-rose-200 bg-rose-50 text-rose-800";
  if (state === "success")
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (state === "loading") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-white text-slate-700";
}

export default function Login({
  cart,
  setCart,
  orderDraft,
  setOrderDraft,
  onAuthChanged,
}) {
  const navigate = useNavigate();

  const [existing, setExisting] = useState(() => getStoredAuth());
  const [teamName, setTeamName] = useState("");
  const [password, setPassword] = useState("");

  const [status, setStatus] = useState({ state: "idle", message: "" });

  useEffect(() => {
    // Keep local view in sync if localStorage changes in another tab.
    const onStorage = (e) => {
      if (!e || e.storageArea !== window.localStorage) return;
      setExisting(getStoredAuth());
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (existing?.user?.teamName) setTeamName(String(existing.user.teamName));
  }, [existing?.user?.teamName]);

  const logout = () => {
    clearStoredAuth();
    setExisting(getStoredAuth());
    if (typeof onAuthChanged === "function") onAuthChanged(null);

    // Clear local data on logout.
    if (typeof setCart === "function") setCart({});
    if (typeof setOrderDraft === "function") {
      setOrderDraft({
        teamName: "",
        leaderName: "",
        phone: "",
        email: "",
        transactionId: "",
      });
    }

    setStatus({ state: "idle", message: "Logged out." });
  };

  const login = async (e) => {
    e.preventDefault();

    const tn = String(teamName || "").trim();
    const pw = String(password || "").trim();

    if (!tn || !pw) {
      setStatus({
        state: "error",
        message: "Enter your team name and password.",
      });
      return;
    }

    try {
      setStatus({ state: "loading", message: "Logging in…" });
      const res = await loginUser({ teamName: tn, password: pw });
      const token = String(res?.token || "");
      const user = safeObj(res?.user);

      if (!token || !user) throw new Error("Login failed");

      storeAuth({ token, user });
      setExisting(getStoredAuth());
      if (typeof onAuthChanged === "function") onAuthChanged({ token, user });

      // Restore saved data (cart + orderDraft) if available.
      try {
        const ud = await getUserData();
        const data = safeObj(ud?.data) || {};

        if (data.cart && typeof data.cart === "object") {
          setCart(data.cart);
        }
        if (data.orderDraft && typeof data.orderDraft === "object") {
          setOrderDraft(data.orderDraft);
        }
      } catch {
        // If no data exists yet, create it from current client state.
        await putUserData({ cart: cart ?? {}, orderDraft: orderDraft ?? {} });
      }

      setStatus({
        state: "success",
        message: "Logged in. We’ll continue from where you left off.",
      });
      navigate("/");
    } catch (err) {
      setStatus({ state: "error", message: err?.message || "Login failed" });
    }
  };

  const loggedInName = existing?.user?.teamName || "";

  return (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
        <div className="grid md:grid-cols-5">
          {/* Left: brand / message */}
          <div className="md:col-span-2 bg-[#FDE68A]">
            <div className="h-full px-6 py-8 sm:px-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-800 ring-1 ring-amber-200">
                Sign in required
              </div>

              <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
                Welcome back
              </h1>
              <p className="mt-2 text-sm text-slate-700">
                Please sign in to access the app.
              </p>

              <div className="mt-6 grid gap-3 text-sm text-slate-800">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#2BAD98] ring-1 ring-amber-200">
                    ✓
                  </span>
                  <span>Use the team name and password given to you</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#2BAD98] ring-1 ring-amber-200">
                    ✓
                  </span>
                  <span>Your cart and details are restored after sign in</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#2BAD98] ring-1 ring-amber-200">
                    ✓
                  </span>
                  <span>Logout clears your cart here</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: form */}
          <div className="md:col-span-3">
            <div className="px-6 py-8 sm:px-10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Login
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    Use the username and password given to you.
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-amber-50"
                  onClick={() => navigate("/login")}
                >
                  Back
                </button>
              </div>

              {loggedInName ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  Logged in as{" "}
                  <span className="font-semibold">{loggedInName}</span>
                </div>
              ) : null}

              {status.message ? (
                <div
                  className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${statusBoxClass(status.state)}`}
                >
                  {status.message}
                </div>
              ) : null}

              {existing?.token ? (
                <div className="mt-5 grid gap-3">
                  <p className="text-sm text-slate-700">
                    You are already logged in. Logout to switch accounts.
                  </p>

                  <button
                    type="button"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    onClick={logout}
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <form onSubmit={login} className="mt-5 grid gap-4">
                  <label className="grid gap-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Team Name
                    </span>
                    <input
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                      placeholder="Enter team name"
                      autoComplete="username"
                      disabled={status.state === "loading"}
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Password
                    </span>
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type="password"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      disabled={status.state === "loading"}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={status.state === "loading"}
                    className="w-full rounded-xl bg-[#FF2D87] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-95 disabled:opacity-60"
                  >
                    {status.state === "loading" ? "Logging in…" : "Login"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
