import mongoose from 'mongoose'

const PaymentQrSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, required: true, trim: true },
    imagePublicId: { type: String, default: '' },
    isActive: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
)

export const PaymentQr = mongoose.model('PaymentQr', PaymentQrSchema)
