import { Order } from '../models/Order.js'
import { sendMail } from './mailer.js'

function asTrimmedString(value) {
  return String(value ?? '').trim()
}

function isMailEnabled() {
  const enabledRaw = process.env.MAIL_ENABLED
  return String(enabledRaw ?? '').trim().toLowerCase() === 'true'
}

export async function deliverDecisionEmailForOrder(orderId) {
  const id = asTrimmedString(orderId)
  if (!id) return

  // If mail is disabled, do not consume the queue. Keep it queued for later.
  if (!isMailEnabled()) return

  // Prevent duplicates (atomic lock): only one worker can claim a given order.
  const order = await Order.findOneAndUpdate(
    {
      _id: id,
      decisionEmailSent: false,
      status: { $in: ['Verified', 'Rejected'] },
      'decisionEmail.status': { $in: ['queued', 'failed'] },
      'decisionEmail.type': { $in: ['Verified', 'Rejected'] },
    },
    {
      $set: {
        'decisionEmail.status': 'sending',
        'decisionEmail.lastAttemptAt': new Date(),
      },
      $inc: { 'decisionEmail.attempts': 1 },
    },
    { new: true }
  )

  if (!order) return

  // Prevent duplicates (secondary check; should be redundant with the query).
  if (order.decisionEmailSent) return

  try {
    const result = await sendMail(order)
    if (!result?.ok) {
      order.decisionEmail.status = 'queued'
      order.decisionEmail.lastError = asTrimmedString(result?.reason || 'Skipped')
      await order.save()
      return
    }

    order.decisionEmailSent = true
    order.decisionEmail.status = 'sent'
    order.decisionEmail.sentAt = new Date()
    order.decisionEmail.lastError = ''
    await order.save()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('MAIL FAILED:', err)

    order.decisionEmail.status = 'failed'
    order.decisionEmail.lastError = asTrimmedString(err?.message || err)
    await order.save()
  }
}

export function startDecisionEmailDispatcher() {
  const enabledRaw = process.env.MAIL_ENABLED
  const enabled = String(enabledRaw ?? '').trim().toLowerCase() === 'true'
  if (!enabled) {
    // eslint-disable-next-line no-console
    console.log('[mail] Decision-email dispatcher disabled (MAIL_ENABLED!=true)')
    return
  }

  const intervalMs = Math.max(5_000, Number(process.env.MAIL_DISPATCH_INTERVAL_MS || 30_000))
  const batchSize = Math.max(1, Math.min(25, Number(process.env.MAIL_DISPATCH_BATCH_SIZE || 5)))

  // eslint-disable-next-line no-console
  console.log(`[mail] Decision-email dispatcher enabled (every ${intervalMs}ms, batch ${batchSize})`)

  setInterval(async () => {
    try {
      const candidates = await Order.find(
        {
          status: { $in: ['Verified', 'Rejected'] },
          decisionEmailSent: false,
          'decisionEmail.status': { $in: ['queued', 'failed'] },
          'decisionEmail.type': { $in: ['Verified', 'Rejected'] },
        },
        { _id: 1 }
      )
        .sort({ updatedAt: 1 })
        .limit(batchSize)
        .lean()

      for (const o of candidates) {
        // eslint-disable-next-line no-await-in-loop
        await deliverDecisionEmailForOrder(o._id)
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[mail] dispatcher error:', err?.stack || err?.message || err)
    }
  }, intervalMs).unref?.()
}
