import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import { foodsRouter } from './routes/foods.js'
import { ordersRouter } from './routes/orders.js'
import { paymentQrsRouter } from './routes/paymentQrs.js'
import { adminRouter } from './routes/admin.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'
import { addPublicSseClient } from './realtime/publicSse.js'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')

  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : 0)

  app.use(
    helmet({
      // API-only server; keep defaults, but don't enforce CSP here.
      contentSecurityPolicy: false,
    })
  )

  const allowedOrigins = String(process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const corsOptions = {
    origin: (origin, cb) => {
      // Allow non-browser clients (curl/postman) with no Origin header.
      if (!origin) return cb(null, true)
      if (allowedOrigins.length === 0) return cb(new Error('CORS origin not allowed'))
      if (allowedOrigins.includes(origin)) return cb(null, true)
      return cb(new Error('CORS origin not allowed'))
    },
    credentials: true,
  }

  app.use(cors(corsOptions))

  app.use(express.json({ limit: '1mb' }))

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_API || 300),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  })

  const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_ADMIN || 60),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  })

  app.use('/api', apiLimiter)
  app.use('/api/admin', adminLimiter)

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'cb-kare-food-portal-server' })
  })

  // Public SSE stream for client-side live updates.
  app.get('/api/stream', (req, res) => {
    addPublicSseClient(req, res)
  })

  app.use('/api/foods', foodsRouter)
  app.use('/api/orders', ordersRouter)
  app.use('/api/payment-qrs', paymentQrsRouter)
  app.use('/api/admin', adminRouter)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
