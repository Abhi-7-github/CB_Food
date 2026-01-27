import jwt from "jsonwebtoken";

function getSecret() {
  const raw =
    typeof process.env.AUTH_JWT_SECRET === "string"
      ? process.env.AUTH_JWT_SECRET.trim()
      : "";
  if (raw) return raw;

  // Allow a default secret for local dev only.
  if (process.env.NODE_ENV !== "production")
    return "dev-insecure-secret-change-me";

  throw new Error("AUTH_JWT_SECRET is required in production");
}

function getTtl() {
  const raw =
    typeof process.env.AUTH_TOKEN_TTL === "string"
      ? process.env.AUTH_TOKEN_TTL.trim()
      : "";
  // e.g. 30d, 12h
  return raw || "30d";
}

export function signUserToken({ accountKey, userId }) {
  const secret = getSecret();
  const token = jwt.sign(
    {
      sub: String(userId || accountKey),
      accountKey: String(accountKey || ""),
    },
    secret,
    { expiresIn: getTtl() },
  );
  return token;
}

export function verifyUserToken(token) {
  const secret = getSecret();
  return jwt.verify(String(token || ""), secret);
}
