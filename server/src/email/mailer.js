import nodemailer from 'nodemailer'
import sharp from 'sharp'

function isMailEnabled() {
  const enabledRaw = process.env.MAIL_ENABLED
  return String(enabledRaw ?? '').trim().toLowerCase() === 'true'
}

let cachedTransporter = null

function getTransporter() {
  if (cachedTransporter) return cachedTransporter

  const host = String(process.env.SMTP_HOST || '').trim()
  const port = Number(process.env.SMTP_PORT || 0)
  const secureRaw = String(process.env.SMTP_SECURE ?? '').trim().toLowerCase()
  const secure = secureRaw === 'true' || secureRaw === '1'
  const user = String(process.env.SMTP_USER || '').trim()
  const pass = String(process.env.SMTP_PASS || '').trim()

  if (!host || !port || !user || !pass) {
    throw new Error('SMTP configuration is missing (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS)')
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  })

  return cachedTransporter
}

export function initMailer() {
  if (!isMailEnabled()) return
  // Will throw if SMTP env is missing.
  getTransporter()
}

function formatMoney(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return String(n ?? '')
  return `₹${num.toFixed(2)}`
}

function toTwo(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return '0.00'
  return num.toFixed(2)
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildItemsTable(items) {
  const rows = Array.isArray(items) ? items : []

  const body = rows
    .map((it) => {
      const name = escapeHtml(it?.name)
      const qty = Number(it?.quantity) || 0
      const price = Number(it?.price) || 0
      const lineTotal = price * qty

      return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #E8EDF3;color:#1F2937;font-size:14px;">${name}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #E8EDF3;color:#1F2937;font-size:14px;text-align:center;white-space:nowrap;">${qty}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #E8EDF3;color:#1F2937;font-size:14px;text-align:right;white-space:nowrap;">₹${toTwo(price)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #E8EDF3;color:#1F2937;font-size:14px;text-align:right;white-space:nowrap;">₹${toTwo(lineTotal)}</td>
        </tr>
      `
    })
    .join('')

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:14px 0 0 0;">
      <thead>
        <tr>
          <th align="left" style="padding:8px;border-bottom:1px solid #D7DEE8;color:#6B7280;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Item</th>
          <th align="center" style="padding:8px;border-bottom:1px solid #D7DEE8;color:#6B7280;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Qty</th>
          <th align="right" style="padding:8px;border-bottom:1px solid #D7DEE8;color:#6B7280;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Price</th>
          <th align="right" style="padding:8px;border-bottom:1px solid #D7DEE8;color:#6B7280;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Total</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `
}

function safeFilenamePart(value) {
  return String(value ?? '')
    .trim()
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 80)
}

function truncateText(s, maxLen) {
  const str = String(s ?? '')
  if (str.length <= maxLen) return str
  return `${str.slice(0, Math.max(0, maxLen - 1))}…`
}

function buildTicketSvg(params) {
  const paymentStatus = normalizePaymentStatus(params?.paymentStatus || params?.status)
  const isPaid = paymentStatus === 'PAID'

  const leaderName = truncateText(params?.name || params?.leaderName || params?.team?.leaderName || '-', 28)
  const teamName = truncateText(params?.teamName || params?.team?.teamName || '-', 28)
  const orderId = truncateText(params?.orderId || params?._id || '-', 42)
  const transactionId = truncateText(params?.transactionId || params?.payment?.transactionId || '-', 42)
  const rejectionReason = truncateText(params?.reason || params?.rejectionReason || 'Payment was rejected', 70)
  const items = Array.isArray(params?.items) ? params.items : []
  const subtotal = Number(params?.subtotal) || 0

  const accent = isPaid ? '#2E7D5B' : '#B64B4B'
  const accentBg = isPaid ? '#EAF6EF' : '#FBECEE'
  const badgeBg = isPaid ? '#DDF2E6' : '#F6DDE1'
  const badgeText = isPaid ? '#1F6A46' : '#8F2E2E'

  const maxItems = 7
  const shown = items.slice(0, maxItems)
  const remaining = Math.max(0, items.length - shown.length)

  const lineRows = shown
    .map((it, idx) => {
      const y = 360 + idx * 26
      const name = truncateText(it?.name || '-', 26)
      const qty = Number(it?.quantity) || 0
      const price = Number(it?.price) || 0
      const total = price * qty
      return `
        <text x="56" y="${y}" font-size="14" fill="#111827" font-weight="600">${escapeHtml(name)}</text>
        <text x="390" y="${y}" font-size="14" fill="#111827" text-anchor="end">${escapeHtml(String(qty))}</text>
        <text x="500" y="${y}" font-size="14" fill="#111827" text-anchor="end">₹${escapeHtml(toTwo(price))}</text>
        <text x="610" y="${y}" font-size="14" fill="#111827" text-anchor="end" font-weight="700">₹${escapeHtml(toTwo(total))}</text>
      `
    })
    .join('')

  const moreRow =
    remaining > 0
      ? `<text x="56" y="${360 + shown.length * 26}" font-size="12" fill="#6B7280">+${remaining} more item(s)</text>`
      : ''

  const reasonBlock =
    !isPaid
      ? `
        <rect x="48" y="246" rx="12" ry="12" width="584" height="64" fill="${badgeBg}" />
        <text x="64" y="272" font-size="11" fill="${badgeText}" font-weight="800" letter-spacing="1">REJECTION REASON</text>
        <text x="64" y="296" font-size="14" fill="#111827">${escapeHtml(rejectionReason)}</text>
      `
      : ''

  const height = 740

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="680" height="${height}" viewBox="0 0 680 ${height}">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#111827" flood-opacity="0.12" />
      </filter>
      <linearGradient id="header" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${accentBg}" />
        <stop offset="1" stop-color="#FFFFFF" />
      </linearGradient>
    </defs>

    <rect x="0" y="0" width="680" height="${height}" fill="#F4F7FB" />
    <g filter="url(#shadow)">
      <rect x="24" y="24" rx="20" ry="20" width="632" height="${height - 48}" fill="#FFFFFF" stroke="#E6ECF3" />

      <!-- Header -->
      <rect x="24" y="24" rx="20" ry="20" width="632" height="132" fill="url(#header)" />
      <text x="56" y="70" font-family="Arial, sans-serif" font-size="12" fill="${accent}" font-weight="900" letter-spacing="2">CB FOOD PORTAL</text>
      <text x="56" y="102" font-family="Arial, sans-serif" font-size="22" fill="#111827" font-weight="900">Digital Ticket</text>
      <text x="56" y="128" font-family="Arial, sans-serif" font-size="13" fill="#374151">${escapeHtml(isPaid ? 'Your order is confirmed and ready for preparation.' : 'Your payment could not be verified. Please contact support if needed.')}</text>

      <g>
        <rect x="514" y="56" rx="999" ry="999" width="118" height="34" fill="${badgeBg}" />
        <text x="573" y="78" font-family="Arial, sans-serif" font-size="12" fill="${badgeText}" font-weight="900" text-anchor="middle" letter-spacing="1">${escapeHtml(paymentStatus)}</text>
      </g>

      <!-- User + Team -->
      <text x="56" y="188" font-family="Arial, sans-serif" font-size="11" fill="#6B7280" font-weight="800" letter-spacing="1">USER NAME</text>
      <text x="56" y="210" font-family="Arial, sans-serif" font-size="14" fill="#111827" font-weight="800">${escapeHtml(leaderName)}</text>

      <text x="352" y="188" font-family="Arial, sans-serif" font-size="11" fill="#6B7280" font-weight="800" letter-spacing="1">TEAM NAME</text>
      <text x="352" y="210" font-family="Arial, sans-serif" font-size="14" fill="#111827" font-weight="800">${escapeHtml(teamName)}</text>

      <!-- Order / Transaction dashed block -->
      <rect x="48" y="228" rx="16" ry="16" width="584" height="92" fill="#FBFCFE" stroke="#CBD5E1" stroke-dasharray="6 6" />
      <text x="64" y="258" font-family="Arial, sans-serif" font-size="11" fill="#6B7280" font-weight="900" letter-spacing="1">ORDER ID</text>
      <text x="64" y="286" font-family="Arial, sans-serif" font-size="18" fill="#111827" font-weight="900">${escapeHtml(orderId)}</text>

      <text x="632" y="258" font-family="Arial, sans-serif" font-size="11" fill="#6B7280" font-weight="900" letter-spacing="1" text-anchor="end">TRANSACTION ID</text>
      <text x="632" y="286" font-family="Arial, sans-serif" font-size="14" fill="#111827" font-weight="800" text-anchor="end">${escapeHtml(transactionId)}</text>

      <rect x="64" y="302" width="552" height="10" rx="6" ry="6" fill="#111827" opacity="0.10" />
      <rect x="64" y="302" width="552" height="10" rx="6" ry="6" fill="none" stroke="#111827" stroke-width="2" stroke-dasharray="6 4" opacity="0.35" />

      ${reasonBlock}

      <!-- Items header -->
      <text x="56" y="338" font-family="Arial, sans-serif" font-size="13" fill="#111827" font-weight="900">Order Items</text>

      <text x="56" y="356" font-family="Arial, sans-serif" font-size="11" fill="#6B7280" font-weight="900" letter-spacing="1">ITEM</text>
      <text x="390" y="356" font-family="Arial, sans-serif" font-size="11" fill="#6B7280" font-weight="900" letter-spacing="1" text-anchor="end">QTY</text>
      <text x="500" y="356" font-family="Arial, sans-serif" font-size="11" fill="#6B7280" font-weight="900" letter-spacing="1" text-anchor="end">PRICE</text>
      <text x="610" y="356" font-family="Arial, sans-serif" font-size="11" fill="#6B7280" font-weight="900" letter-spacing="1" text-anchor="end">TOTAL</text>

      <line x1="48" y1="366" x2="632" y2="366" stroke="#D7DEE8" />

      ${lineRows}
      ${moreRow}

      <!-- Subtotal -->
      <line x1="48" y1="${560}" x2="632" y2="${560}" stroke="#E8EDF3" />
      <text x="56" y="${590}" font-family="Arial, sans-serif" font-size="11" fill="#6B7280" font-weight="900" letter-spacing="1">SUBTOTAL</text>
      <text x="632" y="${592}" font-family="Arial, sans-serif" font-size="18" fill="#111827" font-weight="900" text-anchor="end">₹${escapeHtml(toTwo(subtotal))}</text>

      <!-- Footer -->
      <text x="56" y="${642}" font-family="Arial, sans-serif" font-size="11" fill="#9CA3AF">Keep this ticket for reference. Generated by CB Food Portal.</text>
      <text x="56" y="${662}" font-family="Arial, sans-serif" font-size="11" fill="#9CA3AF">Order ID: ${escapeHtml(orderId)}</text>
    </g>
  </svg>
  `
}

async function renderTicketPng(svg) {
  const svgBuf = Buffer.from(String(svg || ''), 'utf8')
  // 2x scale for better quality.
  return sharp(svgBuf, { density: 192 }).png({ quality: 90 }).toBuffer()
}

function normalizePaymentStatus(input) {
  const raw = String(input ?? '').trim().toUpperCase()
  if (raw === 'PAID' || raw === 'REJECTED') return raw

  // Back-compat with current Order.status values.
  if (raw === 'VERIFIED') return 'PAID'
  if (raw === 'REJECTED') return 'REJECTED'

  // When called with the order doc, status is at order.status.
  return ''
}

export function buildFinalDecisionEmailTemplate(params) {
  const paymentStatus = normalizePaymentStatus(params?.paymentStatus || params?.status)
  if (paymentStatus !== 'PAID' && paymentStatus !== 'REJECTED') {
    throw new Error('buildFinalDecisionEmailTemplate requires paymentStatus PAID or REJECTED')
  }

  const isPaid = paymentStatus === 'PAID'

  const leaderName = escapeHtml(params?.name || params?.leaderName || params?.team?.leaderName)
  const teamName = escapeHtml(params?.teamName || params?.team?.teamName)
  const orderId = escapeHtml(params?.orderId || params?._id)
  const transactionId = escapeHtml(params?.transactionId || params?.payment?.transactionId)
  const rejectionReason = escapeHtml(params?.reason || params?.rejectionReason)
  const items = Array.isArray(params?.items) ? params.items : []
  const subtotal = Number(params?.subtotal) || 0

  // Soft, professional themes.
  const accent = isPaid ? '#2E7D5B' : '#B64B4B'
  const accentBg = isPaid ? '#EAF6EF' : '#FBECEE'
  const badgeBg = isPaid ? '#DDF2E6' : '#F6DDE1'
  const badgeText = isPaid ? '#1F6A46' : '#8F2E2E'
  const title = isPaid ? 'Payment Verified' : 'Payment Rejected'
  const subtitle = isPaid ? 'Ticket Confirmed' : 'Payment Failed'
  const message = isPaid
    ? 'Your order is confirmed and ready for preparation.'
    : 'Your payment could not be verified. Please contact support if needed.'

  const subject = isPaid
    ? `CB Food Portal - Ticket Confirmed (Order ${orderId || 'N/A'})`
    : `CB Food Portal - Payment Failed (Order ${orderId || 'N/A'})`

  const preheader = isPaid ? 'Payment verified. Your order is confirmed.' : 'Payment rejected. Please review the reason.'

  const reasonBlock =
    !isPaid
      ? `
        <tr>
          <td style="padding:12px 16px 0 16px;">
            <div style="background:${badgeBg};border:1px solid ${badgeBg};border-radius:10px;padding:12px 12px;">
              <div style="color:${badgeText};font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Rejection Reason</div>
              <div style="color:#1F2937;font-size:14px;margin-top:6px;">${rejectionReason || 'Payment was rejected'}</div>
            </div>
          </td>
        </tr>
      `
      : ''

  // NOTE: Use table-based layout + inline styles for Gmail/Outlook compatibility.
  const html = `
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:#F4F7FB;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" style="width:680px;max-width:680px;">
          <tr>
            <td style="padding:0 0 12px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
                <tr>
                  <td style="font-family:Arial,sans-serif;">
                    <div style="color:#111827;font-size:26px;font-weight:900;letter-spacing:-0.02em;">${title}</div>
                    <div style="color:#6B7280;font-size:14px;margin-top:6px;">${subtitle}</div>
                  </td>
                  <td align="right" style="font-family:Arial,sans-serif;">
                    <div style="display:inline-block;background:${accentBg};border:1px solid #E6ECF3;border-radius:999px;padding:8px 12px;">
                      <span style="color:${accent};font-size:12px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;">CB Food Portal</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:#FFFFFF;border:1px solid #E6ECF3;border-radius:18px;overflow:hidden;box-shadow:0 10px 26px rgba(17,24,39,0.08);">
                <tr>
                  <td style="background:${accentBg};padding:18px 18px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
                      <tr>
                        <td style="font-family:Arial,sans-serif;">
                          <div style="color:${accent};font-size:12px;font-weight:900;letter-spacing:0.10em;text-transform:uppercase;">Digital Ticket</div>
                          <div style="color:#111827;font-size:18px;font-weight:900;margin-top:6px;">${teamName || 'Order'} · ${leaderName || 'User'}</div>
                          <div style="color:#374151;font-size:13px;margin-top:8px;">${escapeHtml(message)}</div>
                          <div style="color:#6B7280;font-size:12px;margin-top:10px;">Download your ticket from the attachment (HTML).</div>
                        </td>
                        <td align="right" style="font-family:Arial,sans-serif;">
                          <span style="display:inline-block;background:${badgeBg};color:${badgeText};border:1px solid ${badgeBg};border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;letter-spacing:0.04em;">${paymentStatus}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:16px 16px 4px 16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
                      <tr>
                        <td style="font-family:Arial,sans-serif;padding:0 12px 12px 0;">
                          <div style="color:#6B7280;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">User Name</div>
                          <div style="color:#111827;font-size:14px;font-weight:700;margin-top:4px;">${leaderName || '-'}</div>
                        </td>
                        <td style="font-family:Arial,sans-serif;padding:0 0 12px 12px;">
                          <div style="color:#6B7280;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Team Name</div>
                          <div style="color:#111827;font-size:14px;font-weight:700;margin-top:4px;">${teamName || '-'}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 18px 8px 18px;">
                    <div style="border:1px dashed #CBD5E1;border-radius:14px;padding:14px 14px;background:#FBFCFE;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
                        <tr>
                          <td style="font-family:Arial,sans-serif;">
                            <div style="color:#6B7280;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Order ID</div>
                            <div style="color:#111827;font-size:18px;font-weight:900;margin-top:4px;letter-spacing:0.02em;">${orderId || '-'}</div>
                          </td>
                          <td align="right" style="font-family:Arial,sans-serif;">
                            <div style="color:#6B7280;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Transaction ID</div>
                            <div style="color:#111827;font-size:14px;font-weight:800;margin-top:6px;">${transactionId || '-'}</div>
                          </td>
                        </tr>
                      </table>
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin-top:12px;">
                        <tr>
                          <td style="height:10px;border-radius:6px;background:repeating-linear-gradient(90deg, #111827, #111827 6px, transparent 6px, transparent 10px);"></td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                ${reasonBlock}

                <tr>
                  <td style="padding:12px 18px 0 18px;">
                    <div style="font-family:Arial,sans-serif;color:#111827;font-size:14px;font-weight:800;">Order Items</div>
                    ${buildItemsTable(items)}
                  </td>
                </tr>

                <tr>
                  <td style="padding:14px 18px 18px 18px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
                      <tr>
                        <td style="font-family:Arial,sans-serif;color:#6B7280;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Subtotal</td>
                        <td align="right" style="font-family:Arial,sans-serif;color:#111827;font-size:16px;font-weight:900;white-space:nowrap;">₹${toTwo(subtotal)}</td>
                      </tr>
                    </table>
                    <div style="margin-top:10px;border-top:1px dashed #D7DEE8;"></div>
                    <div style="margin-top:10px;font-family:Arial,sans-serif;color:#6B7280;font-size:12px;">
                      Keep this ticket for reference. You can download the attached HTML ticket and save it offline.
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="background:#F9FBFD;border-top:1px solid #E8EDF3;padding:12px 16px;">
                    <div style="font-family:Arial,sans-serif;color:#6B7280;font-size:12px;">
                      This is an automated message from CB Food Portal.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 0 0 0;">
              <div style="font-family:Arial,sans-serif;color:#9CA3AF;font-size:11px;line-height:1.5;">
                Tip: If you cannot see the ticket styling, try opening this email in Gmail or Outlook.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  `

  const text = isPaid
    ? `Payment Verified\n\nYour order is confirmed and ready for preparation.\n\nTeam: ${teamName || '-'}\nUser: ${leaderName || '-'}\nOrder ID: ${orderId || '-'}\nTransaction ID: ${transactionId || '-'}\nSubtotal: ${formatMoney(subtotal)}`
    : `Payment Rejected\n\nYour payment could not be verified. Please contact support if needed.\n\nTeam: ${teamName || '-'}\nUser: ${leaderName || '-'}\nOrder ID: ${orderId || '-'}\nTransaction ID: ${transactionId || '-'}\nReason: ${rejectionReason || 'Payment was rejected'}`

  return { subject, html, text }
}

export async function sendOrderVerifiedEmail(order) {
  if (!isMailEnabled()) return { ok: false, skipped: true, reason: 'MAIL_DISABLED' }

  const to = String(order?.team?.email || '').trim()
  if (!to) return { ok: false, skipped: true, reason: 'MISSING_TO' }

  const from = String(process.env.MAIL_FROM || process.env.SMTP_USER || '').trim() || undefined
  const { subject, html, text } = buildFinalDecisionEmailTemplate({
    paymentStatus: 'PAID',
    ...order,
    orderId: order?._id,
    transactionId: order?.payment?.transactionId,
    name: order?.team?.leaderName,
    teamName: order?.team?.teamName,
  })

  const transporter = getTransporter()
  const baseName = `CB-Food-Ticket-${safeFilenamePart(order?._id || 'order')}`
  const svg = buildTicketSvg({
    paymentStatus: 'PAID',
    ...order,
    orderId: order?._id,
    transactionId: order?.payment?.transactionId,
    name: order?.team?.leaderName,
    teamName: order?.team?.teamName,
  })
  const png = await renderTicketPng(svg)

  await transporter.sendMail({
    from,
    to,
    subject,
    // Show the ticket image at top (inline) + full HTML ticket below.
    html: `${html}\n<div style="margin-top:14px;text-align:center;">\n  <img alt="Ticket" src="cid:ticket-image" width="640" style="max-width:100%;height:auto;border-radius:14px;"/>\n</div>`,
    text,
    attachments: [
      {
        filename: `${baseName}.png`,
        content: png,
        contentType: 'image/png',
        cid: 'ticket-image',
      },
    ],
  })

  return { ok: true }
}

export async function sendOrderRejectedEmail(order) {
  if (!isMailEnabled()) return { ok: false, skipped: true, reason: 'MAIL_DISABLED' }

  const to = String(order?.team?.email || '').trim()
  if (!to) return { ok: false, skipped: true, reason: 'MISSING_TO' }

  const from = String(process.env.MAIL_FROM || process.env.SMTP_USER || '').trim() || undefined
  const { subject, html, text } = buildFinalDecisionEmailTemplate({
    paymentStatus: 'REJECTED',
    ...order,
    orderId: order?._id,
    transactionId: order?.payment?.transactionId,
    name: order?.team?.leaderName,
    teamName: order?.team?.teamName,
    reason: order?.rejectionReason,
  })

  const transporter = getTransporter()
  const baseName = `CB-Food-Ticket-${safeFilenamePart(order?._id || 'order')}`
  const svg = buildTicketSvg({
    paymentStatus: 'REJECTED',
    ...order,
    orderId: order?._id,
    transactionId: order?.payment?.transactionId,
    name: order?.team?.leaderName,
    teamName: order?.team?.teamName,
    reason: order?.rejectionReason,
  })
  const png = await renderTicketPng(svg)

  await transporter.sendMail({
    from,
    to,
    subject,
    html: `${html}\n<div style="margin-top:14px;text-align:center;">\n  <img alt="Ticket" src="cid:ticket-image" width="640" style="max-width:100%;height:auto;border-radius:14px;"/>\n</div>`,
    text,
    attachments: [
      {
        filename: `${baseName}.png`,
        content: png,
        contentType: 'image/png',
        cid: 'ticket-image',
      },
    ],
  })

  return { ok: true }
}
