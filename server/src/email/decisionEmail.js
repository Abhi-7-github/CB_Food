import { Order } from '../models/Order.js'
import { sendOrderRejectedEmail, sendOrderVerifiedEmail } from './mailer.js'

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

  // Claim the send attempt (exactly-once per order).
  const claimed = await Order.findOneAndUpdate(
    {
      _id: id,
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
  ).lean()

  if (!claimed) return

  const to = asTrimmedString(claimed?.team?.email)
  if (!to) {
    await Order.updateOne(
      { _id: id },
      {
        $set: {
          'decisionEmail.status': 'failed',
          'decisionEmail.lastError': 'Missing recipient email',
        },
      }
    )
    return
  }

  try {
    if (claimed.status === 'Verified') {
      const result = await sendOrderVerifiedEmail(claimed)
      if (!result?.ok) {
        await Order.updateOne(
          { _id: id },
          {
            $set: {
              'decisionEmail.status': 'queued',
              'decisionEmail.lastError': asTrimmedString(result?.reason || 'Skipped'),
            },
          }
        )
        return
      }
    } else if (claimed.status === 'Rejected') {
      const result = await sendOrderRejectedEmail(claimed)
      if (!result?.ok) {
        await Order.updateOne(
          { _id: id },
          {
            $set: {
              'decisionEmail.status': 'queued',
              'decisionEmail.lastError': asTrimmedString(result?.reason || 'Skipped'),
            },
          }
        )
        return
      }
    } else {
      return
    }

    await Order.updateOne(
      { _id: id },
      {
        $set: {
          'decisionEmail.status': 'sent',
          'decisionEmail.sentAt': new Date(),
          'decisionEmail.lastError': '',
        },
      }
    )
  } catch (err) {
    await Order.updateOne(
      { _id: id },
      {
        $set: {
          'decisionEmail.status': 'failed',
          'decisionEmail.lastError': asTrimmedString(err?.message || err),
        },
      }
    )

    // eslint-disable-next-line no-console
    console.error('[mail] decision email failed:', err?.stack || err?.message || err)
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
