import mongoose from 'mongoose'

const OrderItemSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
)

const TeamSchema = new mongoose.Schema(
  {
    teamName: { type: String, required: true, trim: true },
    leaderName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
  },
  { _id: false }
)

const PaymentSchema = new mongoose.Schema(
  {
    method: { type: String, enum: ['QR'], default: 'QR' },
    transactionId: { type: String, required: true, trim: true },
    screenshotUrl: { type: String, default: '' },
    screenshotPublicId: { type: String, default: '' },
    screenshotName: { type: String, default: '' },
    uploadStatus: {
      type: String,
      enum: ['pending', 'uploaded', 'failed'],
      default: 'uploaded',
    },
    uploadError: { type: String, default: '' },
  },
  { _id: false }
)

const DecisionEmailSchema = new mongoose.Schema(
  {
    // Email policy:
    // - never send on create
    // - send exactly once when admin finalizes to Verified or Rejected
    // - do not send for Placed/Delivered
    type: { type: String, enum: ['', 'Verified', 'Rejected'], default: '' },
    status: { type: String, enum: ['none', 'queued', 'sending', 'sent', 'failed'], default: 'none' },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    queuedAt: { type: Date },
    lastAttemptAt: { type: Date },
    sentAt: { type: Date },
  },
  { _id: false }
)

const OrderSchema = new mongoose.Schema(
  {
    clientUserId: { type: String, required: true, index: true },
    // Enforces case-insensitive uniqueness for payment.transactionId
    transactionIdNormalized: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ['Placed', 'Verified', 'Rejected', 'Delivered'], default: 'Placed' },
    rejectionReason: { type: String, default: '' },
    team: { type: TeamSchema, required: true },
    items: { type: [OrderItemSchema], default: [] },
    totalItems: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    payment: { type: PaymentSchema, required: true },
    decisionEmail: { type: DecisionEmailSchema, default: () => ({}) },
    decisionEmailSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
)

export const Order = mongoose.model('Order', OrderSchema)
