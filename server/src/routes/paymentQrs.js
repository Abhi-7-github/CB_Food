import express from 'express'
import { PaymentQr } from '../models/PaymentQr.js'

export const paymentQrsRouter = express.Router()

// GET /api/payment-qrs/active
paymentQrsRouter.get('/active', async (_req, res, next) => {
  try {
    const active = await PaymentQr.findOne({ isActive: true }).sort({ updatedAt: -1, createdAt: -1 }).lean()
    if (!active) return res.json({ id: '', imageUrl: '' })
    return res.json({ id: String(active._id), imageUrl: active.imageUrl })
  } catch (err) {
    next(err)
  }
})
