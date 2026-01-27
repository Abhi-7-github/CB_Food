import express from "express";
import { requireUser } from "../middleware/optionalUser.js";
import { UserData } from "../models/UserData.js";

export const userRouter = express.Router();

function clampJsonSize(obj) {
  // Simple guard: prevent super large blobs.
  const raw = JSON.stringify(obj ?? {});
  if (raw.length > 200_000) {
    const err = new Error("User data too large");
    err.status = 413;
    throw err;
  }
  return JSON.parse(raw);
}

// GET /api/user/data
userRouter.get("/data", requireUser, async (req, res, next) => {
  try {
    const doc = await UserData.findOne({
      accountKey: req.user.accountKey,
    }).lean();
    res.json({ data: doc?.data ?? {}, updatedAt: doc?.updatedAt ?? null });
  } catch (err) {
    next(err);
  }
});

// PUT /api/user/data
// body: { data: { ... } }
userRouter.put("/data", requireUser, async (req, res, next) => {
  try {
    const incoming = req.body?.data;
    if (!incoming || typeof incoming !== "object") {
      return res.status(400).json({ error: "data object is required" });
    }

    const data = clampJsonSize(incoming);

    const doc = await UserData.findOneAndUpdate(
      { accountKey: req.user.accountKey },
      { $set: { data } },
      { upsert: true, new: true },
    ).lean();

    res.json({ ok: true, updatedAt: doc?.updatedAt ?? null });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});
