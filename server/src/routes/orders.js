import express from "express";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { unlink } from "node:fs/promises";
import { getCloudinary } from "../config/cloudinary.js";
import { Order } from "../models/Order.js";
import { broadcastAdminEvent } from "../realtime/adminSse.js";
import { broadcastPublicEvent } from "../realtime/publicSse.js";
import { isAdminRequest } from "../middleware/requireAdmin.js";
import { updateFoodStats } from "../utils/updateFoodStats.js";
import { requireUser } from "../middleware/optionalUser.js";

export const ordersRouter = express.Router();

const MAX_PARALLEL_CLOUDINARY_UPLOADS = Number(
  process.env.MAX_PARALLEL_CLOUDINARY_UPLOADS || 8,
);
let activeCloudinaryUploads = 0;
const cloudinaryUploadWaiters = [];

async function withCloudinaryUploadSlot(fn) {
  if (activeCloudinaryUploads >= MAX_PARALLEL_CLOUDINARY_UPLOADS) {
    await new Promise((resolve) => cloudinaryUploadWaiters.push(resolve));
  }

  activeCloudinaryUploads += 1;
  try {
    return await fn();
  } finally {
    activeCloudinaryUploads -= 1;
    const next = cloudinaryUploadWaiters.shift();
    if (typeof next === "function") next();
  }
}

const upload = multer({
  // Disk storage avoids buffering 10MB*concurrency into RAM.
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => {
      const ext = path.extname(String(file?.originalname || ""));
      const safeExt = ext && ext.length <= 10 ? ext : "";
      cb(
        null,
        `cb-food-${Date.now()}-${crypto.randomUUID()}${safeExt}`,
      );
    },
  }),
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

const MAX_TOTAL_ITEMS_PER_ORDER = 10;

const KLU_EMAIL_DOMAIN = "@klu.ac.in";
const NAME_REGEX = /^[A-Za-z ]+$/;
const TXN_REGEX = /^[A-Za-z0-9]+$/;
const PHONE_REGEX = /^\d{10}$/;

async function uploadToCloudinaryStream({ buffer, folder }) {
  const cloudinary = getCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );

    stream.end(buffer);
  });
}

async function uploadToCloudinaryFile({ filePath, folder }) {
  const cloudinary = getCloudinary();
  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: "image",
  });

  return { url: result.secure_url, publicId: result.public_id };
}

// GET /api/orders
ordersRouter.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 200), 200);
    const cursorRaw = asTrimmedString(req.query.cursor);
    const cursor = cursorRaw ? new Date(cursorRaw) : null;

    const cursorFilter =
      cursor && !Number.isNaN(cursor.getTime())
        ? { createdAt: { $lt: cursor } }
        : {};

    let filter = cursorFilter;

    if (!isAdminRequest(req)) {
      const accountKey = String(req.user?.accountKey || "")
        .trim()
        .toLowerCase();
      if (!accountKey) {
        return res.status(401).json({ error: "Please sign in to continue." });
      }
      filter = { ...cursorFilter, accountKey };
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    if (orders.length > 0) {
      res.set(
        "X-Next-Cursor",
        new Date(orders[orders.length - 1].createdAt).toISOString(),
      );
    }

    res.json(
      orders.map((o) => ({
        id: o._id,
        createdAt: o.createdAt,
        status: o.status,
        rejectionReason: o.rejectionReason,
        team: o.team,
        payment: {
          method: o.payment?.method,
          transactionId: o.payment?.transactionId,
          screenshotUrl: o.payment?.screenshotUrl,
          screenshotName: o.payment?.screenshotName,
          uploadStatus: o.payment?.uploadStatus,
          uploadError: o.payment?.uploadError,
        },
        items: o.items,
        totalItems: o.totalItems,
        subtotal: o.subtotal,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/transaction-id-available?transactionId=...
// Used for client-side debounced validation.
ordersRouter.get("/transaction-id-available", async (req, res, next) => {
  try {
    const transactionId = asTrimmedString(req.query.transactionId);
    if (!transactionId)
      return res.status(400).json({ error: "transactionId is required" });
    if (!TXN_REGEX.test(transactionId)) {
      return res.status(400).json({
        error: "Transaction ID must be alphanumeric (A-Z, 0-9) with no spaces",
      });
    }

    const normalized = transactionId.toLowerCase();
    const exists = await Order.exists({ transactionIdNormalized: normalized });

    res.json({ available: !exists });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders (multipart/form-data)
// fields: teamName, leaderName, phone, email, transactionId, items(JSON), subtotal, totalItems
// file: paymentScreenshot
ordersRouter.post(
  "/",
  // Authenticate before multer buffers the upload into memory.
  requireUser,
  upload.single("paymentScreenshot"),
  async (req, res, next) => {
    try {
      const accountKey = String(req.user?.accountKey || "")
        .trim()
        .toLowerCase();
      const clientUserId = accountKey;
      const teamName = asTrimmedString(req.body.teamName);
      const leaderName = asTrimmedString(req.body.leaderName);
      const phone = asTrimmedString(req.body.phone);
      const email = asTrimmedString(req.body.email);
      const transactionId = asTrimmedString(req.body.transactionId);

      const itemsRaw = req.body.items;
      const subtotal = Number(req.body.subtotal);
      const totalItems = Number(req.body.totalItems);

      if (!teamName || !leaderName || !phone || !email) {
        return res.status(400).json({ error: "Missing required team fields" });
      }

      if (!PHONE_REGEX.test(phone)) {
        return res
          .status(400)
          .json({ error: "Phone number must be exactly 10 digits (0-9 only)" });
      }

      if (!NAME_REGEX.test(leaderName)) {
        return res.status(400).json({
          error: "Team leader name can contain only letters and spaces",
        });
      }

      const emailLower = email.toLowerCase();
      if (!emailLower.endsWith(KLU_EMAIL_DOMAIN)) {
        return res
          .status(400)
          .json({ error: `Email must end with ${KLU_EMAIL_DOMAIN}` });
      }

      if (!transactionId) {
        return res.status(400).json({ error: "Transaction ID is required" });
      }

      if (!TXN_REGEX.test(transactionId)) {
        return res.status(400).json({
          error:
            "Transaction ID must be alphanumeric (A-Z, 0-9) with no spaces",
        });
      }

      if (!accountKey) {
        return res.status(401).json({ error: "Please sign in to continue." });
      }

      if (!req.file) {
        return res.status(400).json({ error: "paymentScreenshot is required" });
      }

      const uploadedFilePath = String(req.file.path || "");
      if (!uploadedFilePath) {
        return res.status(400).json({ error: "Upload failed. Please try again." });
      }

      const transactionIdNormalized = transactionId.toLowerCase();

      // Fraud prevention: block reused transaction IDs (case-insensitive).
      const txnExists = await Order.exists({ transactionIdNormalized });
      if (txnExists) {
        return res.status(409).json({
          error:
            "This transaction ID has already been used. Please enter a valid and unused transaction ID.",
        });
      }

      let items = [];
      try {
        items = typeof itemsRaw === "string" ? JSON.parse(itemsRaw) : itemsRaw;
        if (!Array.isArray(items)) throw new Error("items must be an array");
      } catch {
        return res.status(400).json({ error: "Invalid items JSON" });
      }

      if (items.length < 1 || items.length > 100) {
        return res
          .status(400)
          .json({ error: "items must contain 1 to 100 entries" });
      }

      let computedTotalItems = 0;

      for (const it of items) {
        const id = asTrimmedString(it?.id ?? it?.clientId);
        const name = asTrimmedString(it?.name);
        const price = Number(it?.price);
        const qty = Number(it?.quantity);

        if (!id || !name)
          return res
            .status(400)
            .json({ error: "Each item must have id and name" });
        if (!Number.isFinite(price) || price < 0)
          return res
            .status(400)
            .json({ error: "Each item must have a valid price" });
        if (!Number.isFinite(qty) || qty < 1 || qty > 50)
          return res
            .status(400)
            .json({ error: "Each item must have quantity 1 to 50" });

        computedTotalItems += qty;
      }

      if (computedTotalItems > MAX_TOTAL_ITEMS_PER_ORDER) {
        return res.status(400).json({
          error: `Maximum ${MAX_TOTAL_ITEMS_PER_ORDER} total items allowed per order`,
        });
      }

      const order = await Order.create({
        clientUserId,
        accountKey,
        transactionIdNormalized,
        status: "Placed",
        rejectionReason: "",
        team: { teamName, leaderName, phone, email },
        payment: {
          method: "QR",
          transactionId,
          screenshotUrl: "",
          screenshotPublicId: "",
          screenshotName: req.file.originalname,
          uploadStatus: "pending",
          uploadError: "",
        },
        items: items.map((i) => ({
          clientId: asTrimmedString(i.id ?? i.clientId),
          name: asTrimmedString(i.name),
          price: Number(i.price),
          quantity: Number(i.quantity),
        })),
        subtotal: Number.isFinite(subtotal) ? subtotal : 0,
        // Don't trust client-provided totalItems; compute it from validated items.
        totalItems: computedTotalItems,
      });

      const createdPayload = {
        id: order._id,
        createdAt: order.createdAt,
        status: order.status,
        rejectionReason: order.rejectionReason,
        team: order.team,
        payment: {
          method: order.payment.method,
          transactionId: order.payment.transactionId,
          screenshotUrl: order.payment.screenshotUrl,
          screenshotName: order.payment.screenshotName,
          uploadStatus: order.payment.uploadStatus,
          uploadError: order.payment.uploadError,
        },
        items: order.items,
        subtotal: order.subtotal,
        totalItems: order.totalItems,
      };

      // Update food stats for bestseller calculation
      updateFoodStats(order).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[stats] Failed to update food stats:', err?.message || err)
      })

      broadcastAdminEvent("orderCreated", createdPayload);

      // Let clients refresh their own orders without causing every connected user to refetch.
      broadcastPublicEvent("ordersChanged", {
        action: "orderCreated",
        id: String(order._id),
        accountKey,
        status: order.status,
        at: new Date().toISOString(),
      });

      // New orders can affect bestseller ranking; prompt clients to refresh foods.
      broadcastPublicEvent("foodsChanged", {
        action: "orderCreated",
        id: String(order._id),
        at: new Date().toISOString(),
      });

      // Upload screenshot asynchronously so high concurrency doesn't block request latency.
      const folder = process.env.CLOUDINARY_FOLDER || "cb-kare-food-portal";
      withCloudinaryUploadSlot(() =>
        uploadToCloudinaryFile({ filePath: uploadedFilePath, folder }),
      )
        .then(async (uploaded) => {
          await Order.updateOne(
            { _id: order._id },
            {
              $set: {
                "payment.screenshotUrl": uploaded.url,
                "payment.screenshotPublicId": uploaded.publicId,
                "payment.uploadStatus": "uploaded",
                "payment.uploadError": "",
              },
            },
          );

          broadcastAdminEvent("orderUpdated", {
            id: order._id,
            payment: {
              screenshotUrl: uploaded.url,
              uploadStatus: "uploaded",
              uploadError: "",
            },
          });
        })
        .catch(async (err) => {
          await Order.updateOne(
            { _id: order._id },
            {
              $set: {
                "payment.uploadStatus": "failed",
                "payment.uploadError": asTrimmedString(
                  err?.message || "Upload failed",
                ),
              },
            },
          );

          broadcastAdminEvent("orderUpdated", {
            id: order._id,
            payment: {
              uploadStatus: "failed",
              uploadError: asTrimmedString(err?.message || "Upload failed"),
            },
          });
        })
        .finally(() => {
          unlink(uploadedFilePath).catch(() => {});
        });

      res.status(202).json(createdPayload);
    } catch (err) {
      // Handle unique index race-condition (two users submit same txn at the same time).
      if (err && typeof err === "object" && err.code === 11000) {
        return res.status(409).json({
          error:
            "This transaction ID has already been used. Please enter a valid and unused transaction ID.",
        });
      }
      next(err);
    }
  },
);
