import crypto from "node:crypto";
import { GuestSession } from "../models/GuestSession.js";

const COOKIE_NAME = "cbkare_session";
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function now() {
  return new Date();
}

function parseCookieHeader(headerValue) {
  const raw = typeof headerValue === "string" ? headerValue : "";
  if (!raw) return {};

  const out = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function generateSessionId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(32).toString("hex");
}

function setSessionCookie(res, sessionId) {
  // Required flags (per spec): HttpOnly + Secure + SameSite=None.
  res.cookie(COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: FIVE_DAYS_MS,
    path: "/",
  });
}

async function createNewSession() {
  const createdAt = now();
  const expiresAt = new Date(createdAt.getTime() + FIVE_DAYS_MS);
  const sessionId = generateSessionId();

  const doc = await GuestSession.create({
    sessionId,
    createdAt,
    expiresAt,
    lastSeen: createdAt,
  });

  return doc;
}

export async function guestSessionMiddleware(req, res, next) {
  try {
    // Don't create sessions on CORS preflight.
    if (req.method === "OPTIONS") return next();

    const cookies = parseCookieHeader(req.headers.cookie);
    const cookieSessionId =
      typeof cookies[COOKIE_NAME] === "string"
        ? cookies[COOKIE_NAME].trim()
        : "";

    const attach = (sessionDoc) => {
      req.guestSession = sessionDoc;
      req.sessionId = String(sessionDoc?.sessionId || "");
    };

    // Missing cookie -> new session
    if (!cookieSessionId) {
      const session = await createNewSession();
      setSessionCookie(res, session.sessionId);
      attach(session);
      return next();
    }

    // Cookie exists: load from DB
    const existing = await GuestSession.findOne({ sessionId: cookieSessionId });

    // Not found in DB (deleted/invalid) -> new session
    if (!existing) {
      const session = await createNewSession();
      setSessionCookie(res, session.sessionId);
      attach(session);
      return next();
    }

    const current = now();

    // Expired -> new session
    if (
      existing.expiresAt &&
      existing.expiresAt.getTime() <= current.getTime()
    ) {
      const session = await createNewSession();
      setSessionCookie(res, session.sessionId);
      attach(session);
      return next();
    }

    // Rolling session: refresh expiry + lastSeen
    const nextExpiresAt = new Date(current.getTime() + FIVE_DAYS_MS);
    existing.lastSeen = current;
    existing.expiresAt = nextExpiresAt;
    await existing.save();

    setSessionCookie(res, existing.sessionId);
    attach(existing);

    return next();
  } catch (err) {
    return next(err);
  }
}

export const guestSessionCookieName = COOKIE_NAME;
export const guestSessionMaxAgeMs = FIVE_DAYS_MS;
