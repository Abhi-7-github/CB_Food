import express from "express";
import multer from "multer";

import { requireAdmin } from "../middleware/requireAdmin.js";
import { FoodItem } from "../models/FoodItem.js";
import { Order } from "../models/Order.js";
import { PaymentQr } from "../models/PaymentQr.js";
import { getCloudinary } from "../config/cloudinary.js";
import {
  addAdminSseClient,
  broadcastAdminEvent,
} from "../realtime/adminSse.js";
import { broadcastPublicEvent } from "../realtime/publicSse.js";
import { runAfterResponse } from "../utils/background.js";
import { deliverDecisionEmailForOrder } from "../email/decisionEmail.js";

export const adminRouter = express.Router();

// GET /api/admin/ping (auth check)
adminRouter.get("/ping", requireAdmin, (req, res) => {
  res.json({ ok: true });
});

// GET /api/admin/stream (SSE)
adminRouter.get("/stream", requireAdmin, (req, res) => {
  addAdminSseClient(req, res);
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    if (file?.mimetype && file.mimetype.startsWith("image/"))
      return cb(null, true);
    cb(new Error("Only image uploads are allowed"));
  },
});

function asTrimmedString(value) {
  return String(value ?? "").trim();
}

function asBool(value) {
  if (typeof value === "boolean") return value;
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return null;
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function generateUniqueClientIdFromName(name) {
  const base = slugify(name) || "item";

  let candidate = base;
  for (let i = 0; i < 50; i += 1) {
    // FoodItem.exists returns null/undefined when not found.
    // eslint-disable-next-line no-await-in-loop
    const exists = await FoodItem.exists({ clientId: candidate });
    if (!exists) return candidate;
    candidate = `${base}-${i + 2}`;
  }

  // extremely unlikely fallback
  const rand = Math.random().toString(36).slice(2, 8);
  candidate = `${base}-${rand}`;
  const exists = await FoodItem.exists({ clientId: candidate });
  if (!exists) return candidate;

  throw new Error("Unable to generate unique clientId");
}

async function uploadFoodImage({ buffer, mimeType }) {
  const base64 = buffer.toString("base64");
  const safeMime = String(mimeType || "").toLowerCase();
  const dataUri = `data:${safeMime};base64,${base64}`;

  const cloudinary = getCloudinary();
  const folderBase = process.env.CLOUDINARY_FOLDER || "cb-kare-food-portal";

  const res = await cloudinary.uploader.upload(dataUri, {
    folder: `${folderBase}/foods`,
    resource_type: "image",
  });

  return {
    url: res.secure_url,
    publicId: res.public_id,
  };
}

async function uploadPaymentQrImage({ buffer, mimeType }) {
  const base64 = buffer.toString("base64");
  const safeMime = String(mimeType || "").toLowerCase();
  const dataUri = `data:${safeMime};base64,${base64}`;

  const cloudinary = getCloudinary();
  const folderBase = process.env.CLOUDINARY_FOLDER || "cb-kare-food-portal";

  const res = await cloudinary.uploader.upload(dataUri, {
    folder: `${folderBase}/payment-qrs`,
    resource_type: "image",
  });

  return {
    url: res.secure_url,
    publicId: res.public_id,
  };
}

async function setSingleActivePaymentQr(idToActivate) {
  const id = String(idToActivate || "").trim();
  if (!id) throw new Error("payment qr id is required");

  // Best-effort atomic: set all false, then set one true.
  await PaymentQr.updateMany({}, { $set: { isActive: false } });
  const updated = await PaymentQr.findByIdAndUpdate(
    id,
    { $set: { isActive: true } },
    { new: true },
  ).lean();
  return updated;
}

// GET /api/admin/payment-qrs
adminRouter.get("/payment-qrs", requireAdmin, async (_req, res, next) => {
  try {
    const list = await PaymentQr.find({}).sort({ createdAt: -1 }).lean();
    res.json(
      list.map((q) => ({
        id: String(q._id),
        imageUrl: q.imageUrl,
        isActive: Boolean(q.isActive),
        uploadStatus: q.uploadStatus,
        uploadError: q.uploadError,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/payment-qrs (multipart/form-data)
// File: image
adminRouter.post(
  "/payment-qrs",
  requireAdmin,
  upload.single("image"),
  async (req, res, next) => {
    try {
      const count = await PaymentQr.countDocuments({});
      if (count >= 4)
        return res
          .status(400)
          .json({
            error: "Maximum 4 QR codes allowed. Delete one to upload more.",
          });
      if (!req.file)
        return res.status(400).json({ error: "image file is required" });

      // Create DB record first, respond immediately, then upload to Cloudinary in the background.
      const doc = await PaymentQr.create({
        imageUrl: "",
        imagePublicId: "",
        isActive: false,
        uploadStatus: "pending",
        uploadError: "",
      });

      res.status(201).json({
        id: String(doc._id),
        imageUrl: doc.imageUrl,
        isActive: Boolean(doc.isActive),
        uploadStatus: doc.uploadStatus,
        uploadError: doc.uploadError,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      });

      broadcastAdminEvent("paymentQrChanged", {
        action: "created",
        id: String(doc._id),
        at: new Date().toISOString(),
      });
      broadcastPublicEvent("paymentQrChanged", {
        action: "created",
        id: String(doc._id),
        at: new Date().toISOString(),
      });

      const buffer = req.file.buffer;
      const mimeType = req.file.mimetype;
      runAfterResponse(res, "upload payment qr image", async () => {
        try {
          const uploaded = await uploadPaymentQrImage({ buffer, mimeType });
          await PaymentQr.updateOne(
            { _id: doc._id },
            {
              $set: {
                imageUrl: uploaded.url,
                imagePublicId: uploaded.publicId,
                uploadStatus: "uploaded",
                uploadError: "",
              },
            },
          );
        } catch (err) {
          await PaymentQr.updateOne(
            { _id: doc._id },
            {
              $set: {
                uploadStatus: "failed",
                uploadError: asTrimmedString(err?.message || "Upload failed"),
              },
            },
          );
        }

        broadcastAdminEvent("paymentQrChanged", {
          action: "updated",
          id: String(doc._id),
          at: new Date().toISOString(),
        });
        broadcastPublicEvent("paymentQrChanged", {
          action: "updated",
          id: String(doc._id),
          at: new Date().toISOString(),
        });
      });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/admin/payment-qrs/:id/active
// Body: { active: boolean }
adminRouter.patch(
  "/payment-qrs/:id/active",
  requireAdmin,
  express.json(),
  async (req, res, next) => {
    try {
      const id = asTrimmedString(req.params.id);
      const activeParsed = asBool(req.body?.active);
      if (!id)
        return res.status(400).json({ error: "payment qr id is required" });
      if (activeParsed === null)
        return res.status(400).json({ error: "active must be true/false" });

      if (activeParsed) {
        const doc = await PaymentQr.findById(id).lean();
        if (!doc)
          return res.status(404).json({ error: "Payment QR not found" });
        const hasImage =
          typeof doc.imageUrl === "string" && doc.imageUrl.trim().length > 0;
        if (!hasImage || doc.uploadStatus !== "uploaded") {
          return res
            .status(400)
            .json({
              error:
                "QR image is not ready yet. Please wait for upload to finish.",
            });
        }
      }

      let updated = null;
      if (activeParsed) {
        updated = await setSingleActivePaymentQr(id);
        if (!updated)
          return res.status(404).json({ error: "Payment QR not found" });
      } else {
        updated = await PaymentQr.findByIdAndUpdate(
          id,
          { $set: { isActive: false } },
          { new: true },
        ).lean();
        if (!updated)
          return res.status(404).json({ error: "Payment QR not found" });
      }

      res.json({
        id: String(updated._id),
        imageUrl: updated.imageUrl,
        isActive: Boolean(updated.isActive),
        uploadStatus: updated.uploadStatus,
        uploadError: updated.uploadError,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });

      broadcastAdminEvent("paymentQrChanged", {
        action: "activeChanged",
        id: String(updated._id),
        at: new Date().toISOString(),
      });
      broadcastPublicEvent("paymentQrChanged", {
        action: "activeChanged",
        id: String(updated._id),
        at: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/admin/payment-qrs/:id
adminRouter.delete("/payment-qrs/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = asTrimmedString(req.params.id);
    if (!id)
      return res.status(400).json({ error: "payment qr id is required" });

    const deleted = await PaymentQr.findByIdAndDelete(id).lean();
    if (!deleted)
      return res.status(404).json({ error: "Payment QR not found" });

    res.json({ ok: true, id });
    broadcastAdminEvent("paymentQrChanged", {
      action: "deleted",
      id,
      at: new Date().toISOString(),
    });
    broadcastPublicEvent("paymentQrChanged", {
      action: "deleted",
      id,
      at: new Date().toISOString(),
    });

    // Cloudinary cleanup in background (never block HTTP response).
    const publicId = asTrimmedString(deleted.imagePublicId);
    if (publicId) {
      runAfterResponse(res, "delete payment qr image", async () => {
        try {
          const cloudinary = getCloudinary();
          await cloudinary.uploader.destroy(publicId, {
            resource_type: "image",
          });
        } catch {
          // ignore
        }
      });
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/foods
// Supports JSON or multipart/form-data.
// Fields: clientId, name, description, isVeg, price, imageUrl?, isActive?
// File (optional): image
adminRouter.post(
  "/foods",
  requireAdmin,
  upload.single("image"),
  async (req, res, next) => {
    try {
      let clientId = asTrimmedString(req.body.clientId);
      const name = asTrimmedString(req.body.name);
      const description = asTrimmedString(req.body.description);
      const price = Number(req.body.price);
      const isVegParsed = asBool(req.body.isVeg);
      const isActiveParsed = asBool(req.body.isActive);
      const imageUrlProvided = asTrimmedString(req.body.imageUrl);

      if (!name) return res.status(400).json({ error: "name is required" });
      if (isVegParsed === null)
        return res.status(400).json({ error: "isVeg must be true/false" });
      if (!Number.isFinite(price) || price < 0)
        return res.status(400).json({ error: "price must be a number >= 0" });

      if (!clientId) {
        clientId = await generateUniqueClientIdFromName(name);
      }

      const hasFile = Boolean(req.file);
      const doc = await FoodItem.create({
        clientId,
        name,
        description,
        isVeg: isVegParsed,
        price,
        imageUrl: hasFile ? "" : imageUrlProvided,
        imagePublicId: "",
        imageUploadStatus: hasFile ? "pending" : "uploaded",
        imageUploadError: "",
        isActive: isActiveParsed === null ? true : isActiveParsed,
      });

      res.status(201).json({
        id: doc.clientId,
        name: doc.name,
        description: doc.description,
        isVeg: doc.isVeg,
        price: doc.price,
        image: doc.imageUrl,
        imageUploadStatus: doc.imageUploadStatus,
        imageUploadError: doc.imageUploadError,
        isActive: doc.isActive,
        createdAt: doc.createdAt,
      });

      broadcastPublicEvent("foodsChanged", {
        action: "created",
        id: doc.clientId,
        at: new Date().toISOString(),
      });

      if (hasFile) {
        const buffer = req.file.buffer;
        const mimeType = req.file.mimetype;
        runAfterResponse(res, "upload food image", async () => {
          try {
            const uploaded = await uploadFoodImage({ buffer, mimeType });
            await FoodItem.updateOne(
              { clientId: doc.clientId },
              {
                $set: {
                  imageUrl: uploaded.url,
                  imagePublicId: uploaded.publicId,
                  imageUploadStatus: "uploaded",
                  imageUploadError: "",
                },
              },
            );
          } catch (err) {
            await FoodItem.updateOne(
              { clientId: doc.clientId },
              {
                $set: {
                  imageUploadStatus: "failed",
                  imageUploadError: asTrimmedString(
                    err?.message || "Upload failed",
                  ),
                },
              },
            );
          }

          broadcastPublicEvent("foodsChanged", {
            action: "updated",
            id: doc.clientId,
            at: new Date().toISOString(),
          });
        });
      }
    } catch (err) {
      // duplicate key error for clientId
      if (err?.code === 11000) {
        return res
          .status(409)
          .json({ error: "Food item with this clientId already exists" });
      }
      next(err);
    }
  },
);

// GET /api/admin/foods
// Returns all foods (including inactive) for admin management.
adminRouter.get("/foods", requireAdmin, async (req, res, next) => {
  try {
    const foods = await FoodItem.find({}).sort({ createdAt: -1 }).lean();
    res.json(
      foods.map((f) => ({
        id: f.clientId,
        name: f.name,
        description: f.description,
        isVeg: f.isVeg,
        price: f.price,
        image: f.imageUrl,
        isActive: f.isActive,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});

function asOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

// PATCH /api/admin/foods/:id
// Supports JSON or multipart/form-data.
// Fields: name?, description?, isVeg?, price?, imageUrl?, isActive?
// File (optional): image
adminRouter.patch(
  "/foods/:id",
  requireAdmin,
  upload.single("image"),
  async (req, res, next) => {
    try {
      const id = asTrimmedString(req.params.id);
      if (!id) return res.status(400).json({ error: "food id is required" });

      const existing = await FoodItem.findOne({ clientId: id }).lean();
      if (!existing)
        return res.status(404).json({ error: "Food item not found" });

      const updates = {};

      if (req.body?.name !== undefined) {
        const name = asTrimmedString(req.body.name);
        if (!name)
          return res.status(400).json({ error: "name cannot be empty" });
        updates.name = name;
      }

      if (req.body?.description !== undefined) {
        updates.description = asTrimmedString(req.body.description);
      }

      if (req.body?.isVeg !== undefined) {
        const isVegParsed = asBool(req.body.isVeg);
        if (isVegParsed === null)
          return res.status(400).json({ error: "isVeg must be true/false" });
        updates.isVeg = isVegParsed;
      }

      if (req.body?.isActive !== undefined) {
        const isActiveParsed = asBool(req.body.isActive);
        if (isActiveParsed === null)
          return res.status(400).json({ error: "isActive must be true/false" });
        updates.isActive = isActiveParsed;
      }

      if (req.body?.price !== undefined) {
        const price = asOptionalNumber(req.body.price);
        if (price === null || price < 0)
          return res.status(400).json({ error: "price must be a number >= 0" });
        updates.price = price;
      }

      if (req.body?.imageUrl !== undefined) {
        updates.imageUrl = asTrimmedString(req.body.imageUrl);
        updates.imagePublicId = "";
        updates.imageUploadStatus = "uploaded";
        updates.imageUploadError = "";
      }

      const hasNewFile = Boolean(req.file);
      if (hasNewFile) {
        updates.imageUploadStatus = "pending";
        updates.imageUploadError = "";
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }

      const doc = await FoodItem.findOneAndUpdate(
        { clientId: id },
        { $set: updates },
        { new: true },
      ).lean();
      if (!doc) return res.status(404).json({ error: "Food item not found" });

      res.json({
        id: doc.clientId,
        name: doc.name,
        description: doc.description,
        isVeg: doc.isVeg,
        price: doc.price,
        image: doc.imageUrl,
        imageUploadStatus: doc.imageUploadStatus,
        imageUploadError: doc.imageUploadError,
        isActive: doc.isActive,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      });

      // Background image work (upload/cleanup) after response.
      if (req.body?.imageUrl !== undefined && existing.imagePublicId) {
        const oldPublicId = asTrimmedString(existing.imagePublicId);
        if (oldPublicId) {
          runAfterResponse(res, "delete old food image", async () => {
            try {
              const cloudinary = getCloudinary();
              await cloudinary.uploader.destroy(oldPublicId, {
                resource_type: "image",
              });
            } catch {
              // ignore
            }
          });
        }
      }

      if (hasNewFile) {
        const oldPublicId = asTrimmedString(existing.imagePublicId);
        const buffer = req.file.buffer;
        const mimeType = req.file.mimetype;
        runAfterResponse(res, "upload updated food image", async () => {
          try {
            const uploaded = await uploadFoodImage({ buffer, mimeType });
            await FoodItem.updateOne(
              { clientId: id },
              {
                $set: {
                  imageUrl: uploaded.url,
                  imagePublicId: uploaded.publicId,
                  imageUploadStatus: "uploaded",
                  imageUploadError: "",
                },
              },
            );

            if (oldPublicId) {
              try {
                const cloudinary = getCloudinary();
                await cloudinary.uploader.destroy(oldPublicId, {
                  resource_type: "image",
                });
              } catch {
                // ignore
              }
            }
          } catch (err) {
            await FoodItem.updateOne(
              { clientId: id },
              {
                $set: {
                  imageUploadStatus: "failed",
                  imageUploadError: asTrimmedString(
                    err?.message || "Upload failed",
                  ),
                },
              },
            );
          }

          broadcastPublicEvent("foodsChanged", {
            action: "updated",
            id,
            at: new Date().toISOString(),
          });
        });
      }

      broadcastPublicEvent("foodsChanged", {
        action: "updated",
        id: doc.clientId,
        at: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/admin/foods/:id
adminRouter.delete("/foods/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = asTrimmedString(req.params.id);
    if (!id) return res.status(400).json({ error: "food id is required" });

    const deleted = await FoodItem.findOneAndDelete({ clientId: id }).lean();
    if (!deleted) return res.status(404).json({ error: "Food item not found" });

    res.json({ ok: true, id });

    // Best-effort Cloudinary cleanup in background.
    const publicId = asTrimmedString(deleted.imagePublicId);
    if (publicId) {
      runAfterResponse(res, "delete food image", async () => {
        try {
          const cloudinary = getCloudinary();
          await cloudinary.uploader.destroy(publicId, {
            resource_type: "image",
          });
        } catch {
          // ignore
        }
      });
    }

    broadcastPublicEvent("foodsChanged", {
      action: "deleted",
      id,
      at: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/orders/:id/status
// Body: { status: 'Placed' | 'Verified' | 'Rejected' | 'Delivered', reason?: string }
adminRouter.patch(
  "/orders/:id/status",
  requireAdmin,
  express.json(),
  async (req, res, next) => {
    try {
      const id = asTrimmedString(req.params.id);
      const status = asTrimmedString(req.body?.status);
      const reason = asTrimmedString(req.body?.reason);

      const allowed = new Set(["Placed", "Verified", "Rejected", "Delivered"]);
      if (!id) return res.status(400).json({ error: "order id is required" });
      if (!allowed.has(status))
        return res.status(400).json({ error: "Invalid status" });
      if (status === "Rejected" && !reason)
        return res.status(400).json({ error: "Rejection reason is required" });

      // Email rule:
      // - Only ONE email when admin finalizes decision: Placed -> Verified OR Placed -> Rejected
      // - Never send email for Placed or Delivered
      // Duplicate protection is enforced by only updating when current status is Placed.
      const isFinalDecision = status === "Verified" || status === "Rejected";

      let updated = null;
      let shouldSendDecisionEmail = false;

      if (isFinalDecision) {
        updated = await Order.findOneAndUpdate(
          { _id: id, status: "Placed" },
          {
            $set: {
              status,
              rejectionReason: status === "Rejected" ? reason : "",
              decisionEmail: {
                type: status,
                status: "queued",
                attempts: 0,
                lastError: "",
                queuedAt: new Date(),
              },
            },
          },
          { new: true },
        ).lean();

        if (updated) {
          shouldSendDecisionEmail = true;
        } else {
          // Already finalized (Verified/Rejected/Delivered) or not found.
          updated = await Order.findById(id).lean();
        }
      } else {
        updated = await Order.findByIdAndUpdate(
          id,
          {
            $set: {
              status,
              rejectionReason: status === "Rejected" ? reason : "",
            },
          },
          { new: true },
        ).lean();
      }

      if (!updated) return res.status(404).json({ error: "Order not found" });

      const payload = {
        id: updated._id,
        createdAt: updated.createdAt,
        status: updated.status,
        rejectionReason: updated.rejectionReason,
        team: updated.team,
        payment: {
          method: updated.payment?.method,
          transactionId: updated.payment?.transactionId,
          screenshotUrl: updated.payment?.screenshotUrl,
          screenshotName: updated.payment?.screenshotName,
          uploadStatus: updated.payment?.uploadStatus,
          uploadError: updated.payment?.uploadError,
        },
        items: updated.items,
        totalItems: updated.totalItems,
        subtotal: updated.subtotal,
      };

      broadcastAdminEvent("orderUpdated", payload);
      broadcastPublicEvent("ordersChanged", {
        action: "statusUpdated",
        id: String(updated._id),
        clientUserId: String(updated.clientUserId || ""),
        ...(updated.accountKey
          ? { accountKey: String(updated.accountKey || "") }
          : {}),
        status: updated.status,
        rejectionReason: updated.rejectionReason,
        at: new Date().toISOString(),
      });

      // Order status changes can affect bestseller ranking; prompt clients to refresh foods.
      broadcastPublicEvent("foodsChanged", {
        action: "orderStatusUpdated",
        id: String(updated._id),
        status: updated.status,
        at: new Date().toISOString(),
      });
      res.json(payload);

      // Email policy (strict):
      // - never on create
      // - never for Placed/Delivered
      // - exactly once when transitioning Placed -> Verified/Rejected
      if (shouldSendDecisionEmail) {
        runAfterResponse(res, "send decision email", async () => {
          try {
            await deliverDecisionEmailForOrder(updated._id);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("Background mail crash:", e);
          }
        });
      }
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/admin/summary/accepted-items
// Returns totals of ordered quantities across accepted orders (Verified/Delivered).
adminRouter.get(
  "/summary/accepted-items",
  requireAdmin,
  async (req, res, next) => {
    try {
      const acceptedStatuses = ["Verified", "Delivered"];

      const [ordersCount, itemsAgg] = await Promise.all([
        Order.countDocuments({ status: { $in: acceptedStatuses } }),
        Order.aggregate([
          { $match: { status: { $in: acceptedStatuses } } },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.clientId",
              clientId: { $first: "$items.clientId" },
              name: { $first: "$items.name" },
              quantity: { $sum: "$items.quantity" },
            },
          },
          {
            $lookup: {
              from: FoodItem.collection.name,
              localField: "clientId",
              foreignField: "clientId",
              as: "food",
            },
          },
          {
            $addFields: {
              isVeg: { $arrayElemAt: ["$food.isVeg", 0] },
            },
          },
          { $project: { food: 0 } },
          { $sort: { quantity: -1, name: 1 } },
        ]),
      ]);

      const items = Array.isArray(itemsAgg) ? itemsAgg : [];
      const totals = {
        acceptedOrders: ordersCount,
        totalQuantity: 0,
      };
      for (const it of items) totals.totalQuantity += Number(it?.quantity) || 0;

      res.json({
        acceptedStatuses,
        totals,
        items,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);
