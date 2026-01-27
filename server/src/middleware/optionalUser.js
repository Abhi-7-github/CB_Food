import { verifyUserToken } from "../auth/tokens.js";

function parseBearer(headerValue) {
  const raw = typeof headerValue === "string" ? headerValue.trim() : "";
  if (!raw) return "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || "").trim() : "";
}

function safeString(value) {
  return String(value ?? "").trim();
}

function getTokenFromRequest(req) {
  // Normal API calls: Authorization header
  const fromHeader = parseBearer(req.header("authorization"));
  if (fromHeader) return fromHeader;

  // SSE: EventSource can't send headers; allow token in query string
  const fromQuery = safeString(req.query?.token);
  return fromQuery;
}

export function optionalUser(req, _res, next) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = verifyUserToken(token);
    const accountKey = String(decoded?.accountKey || "")
      .trim()
      .toLowerCase();

    if (!accountKey) {
      req.user = null;
      return next();
    }

    req.user = {
      accountKey,
      tokenSubject: String(decoded?.sub || ""),
    };

    return next();
  } catch {
    // Invalid/expired token => treat as guest.
    req.user = null;
    return next();
  }
}

export function requireUser(req, res, next) {
  if (req.user && req.user.accountKey) return next();
  return res.status(401).json({ error: "Please sign in to continue." });
}
