import crypto from 'crypto'

function extractToken(req) {
  const headerKey = req.header('x-admin-key')
  if (headerKey) return String(headerKey)

  const queryKey = req.query?.key ?? req.query?.adminKey
  if (queryKey) return String(queryKey)

  const auth = req.header('authorization')
  if (!auth) return ''

  const m = String(auth).match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : ''
}

export function isAdminRequest(req) {
  const expected = process.env.ADMIN_API_KEY
  if (!expected) return false

  const token = extractToken(req)
  const a = Buffer.from(String(token ?? ''), 'utf8')
  const b = Buffer.from(String(expected ?? ''), 'utf8')
  const sameLength = a.length === b.length
  const ok = sameLength && crypto.timingSafeEqual(a, b)

  return Boolean(token) && ok
}

export function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_API_KEY
  if (!expected) {
    // Drain request body to avoid proxy/client write aborts for multipart uploads.
    req.resume()
    return res.status(500).json({ error: 'ADMIN_API_KEY is not configured on server' })
  }

  const token = extractToken(req)
  const a = Buffer.from(String(token ?? ''), 'utf8')
  const b = Buffer.from(String(expected ?? ''), 'utf8')
  const sameLength = a.length === b.length
  const ok = sameLength && crypto.timingSafeEqual(a, b)

  if (!token || !ok) {
    // Drain request body to avoid proxy/client write aborts for multipart uploads.
    req.resume()
    return res.status(401).json({ error: 'Unauthorized' })
  }

  next()
}
