import { initMailer } from './mailer.js'

export function startEmailWorker() {
  const enabledRaw = process.env.MAIL_ENABLED
  const enabled = String(enabledRaw ?? '').trim().toLowerCase() === 'true'

  if (!enabled) return

  // Warm up mailer module early so missing SMTP env shows up on boot.
  // Does not send any mail.
  try {
    initMailer()
    // eslint-disable-next-line no-console
    console.log('[mail] Mailer initialized')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mail] Mailer failed to initialize:', err?.message || err)
  }
}
