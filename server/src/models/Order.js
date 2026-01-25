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

const OrderSchema = new mongoose.Schema(
  {
    clientUserId: { type: String, required: true, index: true },
    status: { type: String, enum: ['Placed', 'Verified', 'Rejected', 'Delivered'], default: 'Placed' },
    rejectionReason: { type: String, default: '' },
    team: { type: TeamSchema, required: true },
    items: { type: [OrderItemSchema], default: [] },
    totalItems: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    payment: { type: PaymentSchema, required: true },
  },
  { timestamps: true }
)

export const Order = mongoose.model('Order', OrderSchema)
