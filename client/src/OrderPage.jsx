import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkTransactionIdAvailability, createOrder, getActivePaymentQr } from './api/cbKareApi.js'
import { useLocalStorageState } from './hooks/useLocalStorageState.js'
import paymentQr from './assets/payment-qr.svg'

const DEFAULT_DRAFT = {
  teamName: '',
  leaderName: '',
  phone: '',
  email: '',
  transactionId: '',
}

function formatPrice(value) {
  return `₹${value}`
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())
}

const KLU_EMAIL_DOMAIN = '@klu.ac.in'
const NAME_REGEX = /^[A-Za-z ]+$/
const TXN_REGEX = /^[A-Za-z0-9]+$/
const PHONE_REGEX = /^\d+$/

function OrderPage({ foods = [], cart, setCart }) {
  const navigate = useNavigate()

  const [step, setStep] = useState(1)

  const [draft, setDraft] = useLocalStorageState('cbkare.orderDraft', DEFAULT_DRAFT)

  useEffect(() => {
    const isMissingOrNonString = Object.keys(DEFAULT_DRAFT).some((key) => {
      if (!draft || typeof draft !== 'object') return true
      return typeof draft[key] !== 'string'
    })

    if (!isMissingOrNonString) return

    setDraft((prev) => {
      const next = { ...DEFAULT_DRAFT, ...(prev && typeof prev === 'object' ? prev : {}) }
      for (const key of Object.keys(DEFAULT_DRAFT)) {
        next[key] = typeof next[key] === 'string' ? next[key] : String(next[key] ?? '')
      }
      return next
    })
  }, [draft, setDraft])

  useEffect(() => {
    if (!draft) return

    const needsMigration =
      (draft.memberName && !draft.leaderName) || (draft.regNo && !draft.phone)

    if (!needsMigration) return

    setDraft((prev) => ({
      ...prev,
      leaderName: prev.leaderName ?? prev.memberName ?? '',
      phone: prev.phone ?? prev.regNo ?? '',
    }))
  }, [draft, setDraft])

  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [txnCheck, setTxnCheck] = useState({ status: 'idle', message: '' })

  const [paymentScreenshotFile, setPaymentScreenshotFile] = useState(null)
  const [paymentScreenshotUrl, setPaymentScreenshotUrl] = useState('')
  const [paymentScreenshotInputKey, setPaymentScreenshotInputKey] = useState(0)

  const [paymentQrUrl, setPaymentQrUrl] = useState(paymentQr)

  const loadActiveQr = async () => {
    try {
      const res = await getActivePaymentQr()
      const url = String(res?.imageUrl || '').trim()
      setPaymentQrUrl(url || paymentQr)
    } catch {
      setPaymentQrUrl(paymentQr)
    }
  }

  useEffect(() => {
    loadActiveQr()

    const baseRaw = import.meta.env.VITE_API_BASE_URL
    const base = typeof baseRaw === 'string' ? baseRaw.replace(/\/$/, '') : ''
    const url = base ? `${base}/api/stream` : '/api/stream'

    const es = new EventSource(url)
    let timer = null

    const scheduleReload = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        loadActiveQr()
      }, 250)
    }

    es.addEventListener('paymentQrChanged', scheduleReload)
    es.onerror = () => {
      // ignore; EventSource reconnects
    }

    return () => {
      if (timer) window.clearTimeout(timer)
      es.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clearPaymentScreenshot = () => {
    setPaymentScreenshotFile(null)
    setPaymentScreenshotInputKey((k) => k + 1)
    setErrors((prev) => {
      if (!prev || typeof prev !== 'object' || !('paymentScreenshot' in prev)) return prev
      const next = { ...prev }
      delete next.paymentScreenshot
      return next
    })
  }

  useEffect(() => {
    if (!paymentScreenshotFile) {
      setPaymentScreenshotUrl('')
      return
    }

    const url = URL.createObjectURL(paymentScreenshotFile)
    setPaymentScreenshotUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [paymentScreenshotFile])

  const cartItems = useMemo(() => {
    return foods.filter((item) => (cart[item.id] ?? 0) > 0).map((item) => ({
      ...item,
      quantity: cart[item.id] ?? 0,
    }))
  }, [foods, cart])

  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }, [cartItems])

  const totalItems = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0)
  }, [cartItems])

  const validateStep1 = () => {
    const nextErrors = {}
    const teamName = String(draft?.teamName ?? '').trim()
    const leaderName = String(draft?.leaderName ?? '').trim()

    if (!teamName) nextErrors.teamName = 'Team name is required'

    if (!leaderName) nextErrors.leaderName = 'Team leader name is required'
    else if (!NAME_REGEX.test(leaderName)) nextErrors.leaderName = 'Only letters and spaces are allowed'

    const phone = String(draft?.phone ?? '').trim()
    if (!phone) nextErrors.phone = 'Phone number is required'
    else if (!PHONE_REGEX.test(phone)) nextErrors.phone = 'Phone number must contain digits only'

    const email = String(draft?.email ?? '').trim()
    if (!email) nextErrors.email = 'Email is required'
    else if (!isValidEmail(email)) nextErrors.email = 'Enter a valid email'
    else if (!email.toLowerCase().endsWith(KLU_EMAIL_DOMAIN)) nextErrors.email = `Email must end with ${KLU_EMAIL_DOMAIN}`

    if (cartItems.length === 0) nextErrors.cart = 'Your cart is empty'
    else if (cartItems.some((it) => it?.isActive === false)) nextErrors.cart = 'Remove inactive items from cart to continue'
    else if (Number(totalItems) > 10) nextErrors.cart = 'Maximum 10 total items allowed per order'
    return nextErrors
  }

  const validateStep2 = () => {
    const nextErrors = {}
    const tid = String(draft.transactionId ?? '').trim()
    if (!tid) nextErrors.transactionId = 'Transaction ID is required'
    else if (!TXN_REGEX.test(tid)) nextErrors.transactionId = 'Transaction ID must be alphanumeric (A-Z, 0-9) with no spaces'
    else if (txnCheck.status === 'used') nextErrors.transactionId = 'This transaction ID has already been used'
    if (!paymentScreenshotFile) nextErrors.paymentScreenshot = 'Upload payment screenshot'
    return nextErrors
  }

  useEffect(() => {
    const tid = String(draft?.transactionId ?? '').trim()

    if (!tid) {
      setTxnCheck({ status: 'idle', message: '' })
      return
    }

    if (!TXN_REGEX.test(tid)) {
      setTxnCheck({ status: 'invalid', message: 'Only letters and numbers are allowed (no spaces).' })
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setTxnCheck({ status: 'checking', message: 'Checking transaction ID…' })
      try {
        const res = await checkTransactionIdAvailability(tid)
        if (cancelled) return
        const available = Boolean(res?.available)
        if (available) setTxnCheck({ status: 'available', message: 'Transaction ID is available.' })
        else setTxnCheck({ status: 'used', message: 'This transaction ID has already been used.' })
      } catch (e) {
        if (cancelled) return
        setTxnCheck({ status: 'error', message: e?.message || 'Could not verify transaction ID right now.' })
      }
    }, 450)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [draft?.transactionId])

  const goNext = (e) => {
    e.preventDefault()
    const nextErrors = validateStep1()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setStep(2)
  }

  const submitOrder = async (e) => {
    e.preventDefault()

    setSubmitError('')

    const step1Errors = validateStep1()
    const step2Errors = validateStep2()
    const nextErrors = { ...step1Errors, ...step2Errors }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      await createOrder({
        teamName: String(draft?.teamName ?? '').trim(),
        leaderName: String(draft?.leaderName ?? '').trim(),
        phone: String(draft?.phone ?? '').trim(),
        email: String(draft?.email ?? '').trim(),
        transactionId: String(draft?.transactionId ?? '').trim(),
        items: cartItems.map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
        })),
        subtotal,
        totalItems,
        paymentScreenshotFile,
      })

      setCart({})
      setDraft(DEFAULT_DRAFT)
      clearPaymentScreenshot()
      navigate('/orders')
    } catch (err) {
      setSubmitError(err?.message || 'Failed to submit order')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="text-lg font-semibold">{step === 1 ? 'Team & Order Details' : 'Payment'}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {step === 1
            ? 'Enter details for confirmation and communication.'
            : 'Scan the QR and submit payment proof to place your order.'}
        </p>
      </div>

      <section className="w-full rounded-2xl bg-[#FDE68A]" aria-label="Place order">
        <div className="px-5 py-6 sm:px-6 sm:py-7">
          <div className="grid gap-4 lg:grid-cols-5">
        {step === 1 ? (
          <form
            id="orderStep1"
            onSubmit={goNext}
            className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-3"
          >
            {errors.cart ? (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errors.cart}
              </div>
            ) : null}

            <div className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Team Name *</span>
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2BAD98]"
                  value={draft.teamName ?? ''}
                  onChange={(e) => setDraft((p) => ({ ...p, teamName: e.target.value }))}
                  placeholder="e.g. CB Warriors"
                />
                {errors.teamName ? <span className="text-xs text-red-600">{errors.teamName}</span> : null}
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-medium">Team Leader Name *</span>
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2BAD98]"
                  value={draft.leaderName ?? ''}
                  onChange={(e) => setDraft((p) => ({ ...p, leaderName: e.target.value }))}
                  placeholder="Team leader name"
                />
                {errors.leaderName ? (
                  <span className="text-xs text-red-600">{errors.leaderName}</span>
                ) : null}
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-medium">Phone Number *</span>
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2BAD98]"
                  value={draft.phone ?? ''}
                  onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="e.g. 9876543210"
                  inputMode="tel"
                />
                {errors.phone ? <span className="text-xs text-red-600">{errors.phone}</span> : null}
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-medium">College Mail ID *</span>
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2BAD98]"
                  value={draft.email ?? ''}
                  onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
                  placeholder="regno@klu.ac.in"
                  inputMode="email"
                />
                {errors.email ? <span className="text-xs text-red-600">{errors.email}</span> : null}
              </label>
            </div>

            <div className="mt-5 hidden flex-col gap-2 sm:flex-row sm:justify-end lg:flex">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                onClick={() => navigate(-1)}
              >
                Back
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#FF2D87] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={cartItems.length === 0}
              >
                Next
              </button>
            </div>
          </form>
        ) : (
          <form
            id="orderStep2"
            onSubmit={submitOrder}
            className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-3"
          >
            {submitError ? (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {submitError}
              </div>
            ) : null}

            {errors.cart ? (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errors.cart}
              </div>
            ) : null}

            <div className="grid gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold">Scan QR Code</div>
                <div className="mt-2 grid gap-3 sm:grid-cols-[160px_1fr] sm:items-start">
                  <img
                    src={paymentQrUrl}
                    alt="Payment QR"
                    className="h-40 w-40 rounded-xl border border-slate-200 bg-white object-contain"
                  />
                  <div className="text-sm text-slate-700">
                    <div className="font-medium">Pay the amount shown in your Order Summary.</div>
                    <div className="mt-1 text-xs text-slate-600">
                      After payment, upload the screenshot and enter the transaction ID.
                    </div>
                  </div>
                </div>
              </div>

              <label className="grid gap-1">
                <span className="text-sm font-medium">Upload Payment Screenshot *</span>
                <input
                  key={paymentScreenshotInputKey}
                  className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null
                    setPaymentScreenshotFile(file)
                    if (file) {
                      setErrors((prev) => {
                        if (!prev || typeof prev !== 'object' || !('paymentScreenshot' in prev)) return prev
                        const next = { ...prev }
                        delete next.paymentScreenshot
                        return next
                      })
                    }
                  }}
                />

                {paymentScreenshotFile ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-xs text-slate-600">{paymentScreenshotFile.name}</div>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-amber-50"
                      onClick={clearPaymentScreenshot}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}

                {paymentScreenshotUrl ? (
                  <img
                    src={paymentScreenshotUrl}
                    alt="Payment screenshot preview"
                    className="mt-2 max-h-56 w-full rounded-xl border border-slate-200 object-contain"
                  />
                ) : null}
                {errors.paymentScreenshot ? (
                  <span className="text-xs text-red-600">{errors.paymentScreenshot}</span>
                ) : null}
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-medium">Transaction ID *</span>
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2BAD98]"
                  value={draft.transactionId ?? ''}
                  onChange={(e) => setDraft((p) => ({ ...p, transactionId: e.target.value }))}
                  placeholder="Enter transaction/reference id"
                />
                {txnCheck.status === 'checking' ? (
                  <span className="text-xs text-slate-500">{txnCheck.message}</span>
                ) : null}
                {txnCheck.status === 'available' ? (
                  <span className="text-xs text-emerald-700">{txnCheck.message}</span>
                ) : null}
                {txnCheck.status === 'invalid' || txnCheck.status === 'used' || txnCheck.status === 'error' ? (
                  <span className="text-xs text-red-600">{txnCheck.message}</span>
                ) : null}
                {errors.transactionId ? (
                  <span className="text-xs text-red-600">{errors.transactionId}</span>
                ) : null}
              </label>
            </div>

            <div className="mt-5 hidden flex-col gap-2 sm:flex-row sm:justify-end lg:flex">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#FF2D87] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={cartItems.length === 0 || isSubmitting || txnCheck.status === 'used' || txnCheck.status === 'invalid' || txnCheck.status === 'checking'}
              >
                {isSubmitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </form>
        )}

        <aside className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Order Summary</div>
            <button
              type="button"
              className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-amber-50"
              onClick={() => navigate('/cart')}
            >
              Edit Cart
            </button>
          </div>

          {cartItems.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No items in cart.</p>
          ) : (
            <div className="mt-3 grid gap-2">
              {cartItems.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.name}</div>
                    <div className="text-xs text-slate-600">
                      {formatPrice(item.price)} × {item.quantity}
                    </div>
                  </div>
                  <div className="shrink-0 font-semibold">{formatPrice(item.price * item.quantity)}</div>
                </div>
              ))}

              <div className="mt-2 border-t border-slate-200 pt-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Total items</span>
                  <span className="font-semibold">{totalItems}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-semibold">{formatPrice(subtotal)}</span>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Mobile actions: keep buttons near Order Summary */}
        <div className="lg:hidden">
          {step === 1 ? (
            <div className="grid gap-2 sm:flex sm:justify-end">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                onClick={() => navigate(-1)}
              >
                Back
              </button>
              <button
                type="submit"
                form="orderStep1"
                className="rounded-xl bg-[#FF2D87] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={cartItems.length === 0}
              >
                Next
              </button>
            </div>
          ) : (
            <div className="grid gap-2 sm:flex sm:justify-end">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                type="submit"
                form="orderStep2"
                className="rounded-xl bg-[#FF2D87] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={cartItems.length === 0 || isSubmitting || txnCheck.status === 'used' || txnCheck.status === 'invalid' || txnCheck.status === 'checking'}
              >
                {isSubmitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          )}
        </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export { OrderPage }
export default OrderPage
