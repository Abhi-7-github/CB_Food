import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import logo from './assets/EventLogo.jpeg'
import cbKareLogo from './assets/CB-KARE.jpeg'

export default function Navbar({ cartCount = 0, adminKey = '' }) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/')

  const navItems = useMemo(() => {
    if (isAdminRoute) {
      const authed = Boolean(String(adminKey ?? '').trim())
      if (!authed) return []
      return [
        { id: 'admin-foods', label: 'Create Food' },
        { id: 'admin-manage', label: 'Foods List' },
        { id: 'admin-payments', label: 'Verify Payments' },
        { id: 'admin-qrcodes', label: 'Upload QRCode' },
        { id: 'admin-accepted', label: 'Accepted Items' },
      ]
    }

    return [
      { id: 'home', label: 'Home' },
      { id: 'orders', label: 'Orders' },
      { id: 'cart', label: 'Cart' },
    ]
  }, [adminKey, isAdminRoute])

  const go = () => {
    setMobileMenuOpen(false)
  }

  useEffect(() => {
    if (!mobileMenuOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [mobileMenuOpen])

  const toPath = (id) => {
    if (id === 'admin-foods') return '/admin/foods'
    if (id === 'admin-manage') return '/admin/manage'
    if (id === 'admin-payments') return '/admin/payments'
    if (id === 'admin-qrcodes') return '/admin/qrcodes'
    if (id === 'admin-accepted') return '/admin/accepted'
    if (id === 'home') return '/'
    if (id === 'orders') return '/orders'
    return '/cart'
  }

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-amber-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <NavLink to={isAdminRoute ? '/admin/foods' : '/'} className="flex items-center gap-3" aria-label="Home">
            <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-black ring-1 ring-slate-200">
              <img src={cbKareLogo} alt="CB-KARE" className="h-full w-full object-cover" />
            </span>
            <img src={logo} alt="Innovate Kare 2.0" className="h-9 w-auto md:h-10" />
          </NavLink>

          <div className="hidden items-center gap-2 md:flex" aria-label="Primary navigation">
            {navItems.map((item) => {
              return (
                <NavLink
                  key={item.id}
                  to={toPath(item.id)}
                  onClick={go}
                  className={({ isActive }) =>
                    isAdminRoute
                      ? isActive
                        ? 'rounded-xl bg-[#FF2D87] px-4 py-2 text-sm font-semibold text-white'
                        : 'rounded-xl px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-amber-50'
                      : isActive
                        ? 'rounded-full bg-[#FF2D87] px-5 py-2 text-xs font-semibold text-white'
                        : 'rounded-full px-5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100'
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    {item.label}
                    {item.id === 'cart' && cartCount > 0 ? (
                      <span className="rounded-full bg-[#2BAD98] px-2 py-0.5 text-[11px] font-semibold text-white">
                        {cartCount}
                      </span>
                    ) : null}
                  </span>
                </NavLink>
              )
            })}
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-amber-50 md:hidden"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            aria-label="Toggle menu"
          >
            ☰
          </button>
        </div>
      </nav>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          />

          <aside
            id="mobile-menu"
            className="absolute right-0 top-0 h-full w-[82%] max-w-xs border-l border-amber-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-amber-200 px-4 py-3">
              <div className="text-sm font-semibold">Menu</div>
              <button
                type="button"
                className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-amber-50"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              <div className="grid gap-2" aria-label="Mobile navigation">
                {navItems.map((item) => {
                  return (
                    <NavLink
                      key={item.id}
                      to={toPath(item.id)}
                      onClick={go}
                      className={({ isActive }) =>
                        isAdminRoute
                          ? isActive
                            ? 'rounded-xl bg-[#FF2D87] px-4 py-2 text-left text-sm font-semibold text-white'
                            : 'rounded-xl px-4 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-amber-50'
                          : isActive
                            ? 'rounded-xl bg-[#FF2D87] px-4 py-2 text-left text-sm font-semibold text-white'
                            : 'rounded-xl px-4 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100'
                      }
                    >
                      <span className="inline-flex items-center gap-2">
                        {item.label}
                        {item.id === 'cart' && cartCount > 0 ? (
                          <span className="rounded-full bg-[#2BAD98] px-2 py-0.5 text-[11px] font-semibold text-white">
                            {cartCount}
                          </span>
                        ) : null}
                      </span>
                    </NavLink>
                  )
                })}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}
