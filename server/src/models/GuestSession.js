import mongoose from "mongoose";

const GuestSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    lastSeen: { type: Date, required: true },
  },
  { versionKey: false },
);

// TTL index: expire documents exactly at `expiresAt`.
GuestSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const GuestSession = mongoose.model("GuestSession", GuestSessionSchema);
