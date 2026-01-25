import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FoodList from './components/FoodList'
import { sampleFoods } from './data/sampleFoods'

function formatPrice(value) {
	return ` ₹ ${value}`
}

function clampMin0(value) {
	return Math.max(0, value)
}

export default function Home({ foods = [], foodsLoading = false, foodsError = '', cart, setCart }) {
	const navigate = useNavigate()
	const [query, setQuery] = useState('')
	const [typeFilter, setTypeFilter] = useState('all')
	const [cartOpen, setCartOpen] = useState(false)

	const foodsSource = useMemo(() => {
		if (foodsLoading || foodsError) return foods
		return foods.length > 0 ? foods : sampleFoods
	}, [foods, foodsLoading, foodsError])

	const items = useMemo(() => {
		const q = query.trim().toLowerCase()
		return foodsSource.filter((item) => {
			if (typeFilter === 'veg' && !item.isVeg) return false
			if (typeFilter === 'nonveg' && item.isVeg) return false
			if (!q) return true
			const name = String(item.name ?? '').toLowerCase()
			const description = String(item.description ?? '').toLowerCase()
			return (
				name.includes(q) ||
				description.includes(q)
			)
		})
	}, [foodsSource, query, typeFilter])

	const cartItems = useMemo(() => {
		const cartSafe = cart ?? {}
		const foodsById = new Map(foodsSource.map((f) => [String(f.id), f]))
		return Object.entries(cartSafe)
			.filter(([, qty]) => (qty ?? 0) > 0)
			.map(([id, qty]) => {
				const item = foodsById.get(String(id))
				return item
					? { ...item, quantity: qty ?? 0 }
					: { id, name: 'Unknown item', description: '', isVeg: true, price: 0, image: '', isActive: false, quantity: qty ?? 0 }
			})
	}, [cart, foodsSource])

	const cartCount = useMemo(() => {
		return Object.values(cart ?? {}).reduce((sum, n) => sum + (n ?? 0), 0)
	}, [cart])

	const cartSubtotal = useMemo(() => {
		return cartItems.reduce((sum, it) => sum + (it.price ?? 0) * (it.quantity ?? 0), 0)
	}, [cartItems])

	const scrollPadClass = cartCount > 0 ? 'pb-28' : 'pb-6'

	useEffect(() => {
		if (!cartOpen) return
		const onKeyDown = (e) => {
			if (e.key === 'Escape') setCartOpen(false)
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [cartOpen])

	const addOne = (id) => {
		setCart((prev) => ({
			...(prev ?? {}),
			[id]: ((prev ?? {})[id] ?? 0) + 1,
		}))
	}

	const removeOne = (id) => {
		setCart((prev) => {
			const current = (prev ?? {})[id] ?? 0
			const nextQty = clampMin0(current - 1)
			if (nextQty === 0) {
				const { [id]: _, ...rest } = prev ?? {}
				return rest
			}
			return { ...(prev ?? {}), [id]: nextQty }
		})
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="mb-5">
				<div className="flex flex-col gap-4">
					<div className="flex w-full items-stretch overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
						<label className="flex w-full items-center px-4 py-2">
							<span className="sr-only">Search</span>
							<input
								className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search for any dishes"
								inputMode="search"
							/>
						</label>
						<button
							type="button"
							className="grid w-14 place-items-center bg-[#FF2D87] text-white"
							aria-label="Search"
						>
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
								<path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="2" />
								<path d="M16.2 16.2 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
							</svg>
						</button>
					</div>

					<div className="mx-auto inline-flex rounded-xl border border-slate-200 bg-white p-1" aria-label="Filter veg/non-veg">
						<button
							type="button"
							onClick={() => setTypeFilter('all')}
							className={
								typeFilter === 'all'
									? 'min-w-24 rounded-lg bg-[#FF2D87] px-6 py-2 text-xs font-semibold text-white'
									: 'min-w-24 rounded-lg px-6 py-2 text-xs font-semibold text-slate-800 hover:bg-amber-50'
							}
						>
							All
						</button>
						<button
							type="button"
							onClick={() => setTypeFilter('nonveg')}
							className={
								typeFilter === 'nonveg'
									? 'min-w-24 rounded-lg bg-[#FF2D87] px-6 py-2 text-xs font-semibold text-white'
									: 'min-w-24 rounded-lg px-6 py-2 text-xs font-semibold text-slate-800 hover:bg-amber-50'
							}
						>
							Non- Veg
						</button>
						<button
							type="button"
							onClick={() => setTypeFilter('veg')}
							className={
								typeFilter === 'veg'
									? 'min-w-24 rounded-lg bg-[#FF2D87] px-6 py-2 text-xs font-semibold text-white'
									: 'min-w-24 rounded-lg px-6 py-2 text-xs font-semibold text-slate-800 hover:bg-amber-50'
							}
						>
							Veg
						</button>
					</div>
				</div>
			</header>

			<div className="min-h-0 flex-1 flex flex-col">
				{foodsLoading ? (
					<p className="mt-2 text-sm text-slate-600">Loading food items…</p>
				) : foodsError ? (
					<p className="mt-2 text-sm text-red-600">{foodsError}</p>
				) : foodsSource.length === 0 ? (
					<p className="mt-2 text-sm text-slate-600">No food items available yet.</p>
				) : null}

				<section className="min-h-0 w-full flex-1 rounded-2xl bg-[#FDE68A]" aria-label="Food items">
					<div className={"h-full overflow-auto px-5 py-6 sm:px-6 sm:py-7 " + scrollPadClass}>
						<FoodList foods={items} cart={cart} onIncrease={addOne} onDecrease={removeOne} />
					</div>
				</section>
			</div>

			{cartCount > 0 ? (
				<>
					<button
						type="button"
						className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/90 backdrop-blur"
						onClick={() => setCartOpen(true)}
						aria-label="Open cart summary"
					>
						<div className="mx-auto max-w-6xl px-4 py-3">
							<div className="flex items-center justify-between gap-3">
								<div className="min-w-0 text-left">
														<div className="text-sm font-semibold text-slate-900">
															Cart ({cartCount}) •{' '}
															<span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">
																{formatPrice(cartSubtotal)}
															</span>
														</div>
									<div className="mt-1 flex flex-wrap gap-2">
										{cartItems.slice(0, 3).map((it) => (
											<span
												key={it.id}
												className="inline-flex max-w-[220px] items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs"
											>
												<span className="truncate">{it.name}</span>
												<span className="shrink-0 text-slate-600">× {it.quantity}</span>
											</span>
										))}
										{cartItems.length > 3 ? (
											<span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
												+{cartItems.length - 3} more
											</span>
										) : null}
									</div>
								</div>

								<div className="shrink-0 inline-flex items-center gap-2 rounded-full bg-[#FF2D87] px-4 py-2 text-xs font-semibold text-white">
									<span>Open</span>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
										<path d="M6 6h15l-1.5 8.5a2 2 0 0 1-2 1.5H9a2 2 0 0 1-2-1.6L5.3 3.5H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
										<path d="M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor" />
									</svg>
								</div>
							</div>
						</div>
					</button>

					{cartOpen ? (
						<div className="fixed inset-0 z-30" role="dialog" aria-modal="true">
							<button
								type="button"
								className="absolute inset-0 bg-slate-900/30"
								onClick={() => setCartOpen(false)}
								aria-label="Close cart summary"
							/>

							<div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-4 pb-4">
								<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
									<div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
										<div>
											<div className="text-sm font-semibold text-slate-900">Cart summary</div>
															<div className="mt-0.5 text-xs text-slate-600">
																{cartCount} items •{' '}
																<span className="font-semibold text-rose-700">{formatPrice(cartSubtotal)}</span>
															</div>
										</div>
										<button
											type="button"
											className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
											onClick={() => setCartOpen(false)}
											aria-label="Close"
										>
											✕
										</button>
									</div>

									<div className="max-h-[52vh] overflow-auto px-4 py-3">
										<ul className="grid gap-2">
											{cartItems.map((it) => (
												<li key={it.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
													<div className="min-w-0">
														<div className="truncate text-sm font-semibold text-slate-900">{it.name}</div>
														<div className="mt-0.5 text-xs text-slate-600">
															{formatPrice(it.price)} × {it.quantity} ={' '}
															<span className="font-semibold text-slate-900">{formatPrice((it.price ?? 0) * (it.quantity ?? 0))}</span>
														</div>
													</div>

													<div className="shrink-0 inline-flex items-center gap-2">
														<button
															type="button"
															className="h-9 w-9 rounded-xl border border-[#2BAD98] bg-[#EAFBF7] text-base font-semibold text-[#2BAD98] disabled:cursor-not-allowed disabled:opacity-50"
															onClick={() => removeOne(it.id)}
															disabled={(it.quantity ?? 0) === 0 || it?.isActive === false}
															aria-label={`Remove one ${it.name}`}
														>
															−
														</button>
														<div className="w-7 text-center text-sm font-semibold" aria-live="polite">
															{it.quantity}
														</div>
														<button
															type="button"
															className={
																'h-9 w-9 rounded-xl border text-base font-semibold ' +
																(it?.isActive === false
																	? 'border-slate-200 bg-white text-slate-300'
																	: 'border-[#2BAD98] bg-[#EAFBF7] text-[#2BAD98]')
															}
															onClick={() => (it?.isActive === false ? null : addOne(it.id))}
															disabled={it?.isActive === false}
															aria-label={`Add one ${it.name}`}
														>
															+
														</button>
													</div>
												</li>
											))}
										</ul>
									</div>

									<div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
										<button
											type="button"
											className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
											onClick={() => {
												setCartOpen(false)
												navigate('/cart')
											}}
										>
											Go to cart
										</button>
										<button
											type="button"
											className="rounded-xl bg-[#FF2D87] px-4 py-2 text-sm font-semibold text-white"
											onClick={() => {
												setCartOpen(false)
												navigate('/order')
											}}
										>
											Place Order
										</button>
									</div>
								</div>
							</div>
						</div>
					) : null}
				</>
			) : null}
		</div>
	)
}

