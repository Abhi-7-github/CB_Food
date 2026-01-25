export function startEmailWorker() {
  const enabledRaw = process.env.MAIL_ENABLED
  const enabled = String(enabledRaw ?? '').trim().toLowerCase() === 'true'

  if (!enabled) return

  // Email sending is currently not implemented in this codebase.
  // Keeping this as a safe no-op prevents the server from crashing in production.
  // When you add real email logic (e.g., via nodemailer), replace this implementation.
  // eslint-disable-next-line no-console
  console.warn('[mail] MAIL_ENABLED=true but email worker is not implemented yet; skipping.')
}
