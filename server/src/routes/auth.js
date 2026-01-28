import express from "express";
import bcrypt from "bcryptjs";

import {
  loadUsers,
  findUserByIdentifier,
  publicUser,
} from "../config/users.js";
import { signUserToken } from "../auth/tokens.js";
import { requireUser } from "../middleware/optionalUser.js";

export const authRouter = express.Router();

function safeString(value) {
  return String(value ?? "").trim();
}

async function passwordMatches(storedPassword, providedPassword) {
  const stored = safeString(storedPassword);
  const provided = safeString(providedPassword);
  if (!stored || !provided) return false;

  // Support either plaintext or bcrypt hash in users.json.
  if (
    stored.startsWith("$2a$") ||
    stored.startsWith("$2b$") ||
    stored.startsWith("$2y$")
  ) {
    return bcrypt.compare(provided, stored);
  }

  return stored === provided;
}

// POST /api/auth/login
// body: { teamName }
authRouter.post("/login", async (req, res, next) => {
  try {
    const identifier = safeString(req.body?.teamName || req.body?.identifier);

    if (!identifier) {
      return res
        .status(400)
        .json({ error: "Team name is required." });
    }

    const users = await loadUsers();
    const found = findUserByIdentifier(users, identifier);

    if (!found) {
      // Do not leak whether identifier exists.
      return res
        .status(401)
        .json({ error: "Team not found." });
    }

    const u = publicUser(found);
    const token = signUserToken({ accountKey: u.accountKey, userId: u.id });

    return res.json({ token, user: u });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
authRouter.get("/me", requireUser, async (req, res) => {
  res.json({ accountKey: req.user.accountKey });
});
