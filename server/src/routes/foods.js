import express from 'express'
import { FoodItem } from '../models/FoodItem.js'
import { Order } from '../models/Order.js'

export const foodsRouter = express.Router()

// GET /api/foods
foodsRouter.get('/', async (req, res, next) => {
  try {
    const foods = await FoodItem.find({}).sort({ name: 1 }).lean()

    // Bestseller calculation:
    // "ordered by more users" => distinct team emails per food item.
    // Count Placed + Verified + Delivered (exclude Rejected) so bestsellers update immediately after ordering.
    const orders = await Order.find(
      { status: { $in: ['Placed', 'Verified', 'Delivered'] } },
      { items: 1, team: 1, status: 1 }
    ).lean()

    const stats = new Map()
    for (const o of orders) {
      const email = String(o?.team?.email || '').trim().toLowerCase()
      const items = Array.isArray(o?.items) ? o.items : []
      for (const it of items) {
        const id = String(it?.clientId || '').trim()
        if (!id) continue

        let entry = stats.get(id)
        if (!entry) {
          entry = { orderedQty: 0, emails: new Set() }
          stats.set(id, entry)
        }

        entry.orderedQty += Number(it?.quantity || 0)
        if (email) entry.emails.add(email)
      }
    }

    // Mark top N as bestsellers (based on orderedByCount, then orderedQty)
    const ranked = Array.from(stats.entries())
      .map(([clientId, s]) => ({ clientId, orderedByCount: s.emails.size, orderedQty: s.orderedQty }))
      .filter((r) => r.orderedByCount > 0 || r.orderedQty > 0)
      .sort((a, b) => {
        if (b.orderedByCount !== a.orderedByCount) return b.orderedByCount - a.orderedByCount
        return b.orderedQty - a.orderedQty
      })

    const BESTSELLER_TOP_N = 6
    const bestsellerSet = new Set(ranked.slice(0, BESTSELLER_TOP_N).map((r) => r.clientId))

    // Shape to match client expectations
    res.json(
      foods.map((f) => ({
        id: f.clientId,
        name: f.name,
        description: f.description,
        isVeg: f.isVeg,
        price: f.price,
        image: f.imageUrl,
        isActive: f.isActive,

        // Popularity metadata
        orderedByCount: stats.get(f.clientId)?.emails?.size ?? 0,
        orderedQty: stats.get(f.clientId)?.orderedQty ?? 0,
        isBestseller: bestsellerSet.has(f.clientId),
      }))
    )
  } catch (err) {
    next(err)
  }
})
