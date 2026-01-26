import mongoose from 'mongoose'

const PaymentQrSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, required: true, trim: true },
    imagePublicId: { type: String, default: '' },
    isActive: { type: Boolean, default: false, index: true },
    uploadStatus: { type: String, enum: ['uploaded', 'pending', 'failed'], default: 'uploaded' },
    uploadError: { type: String, default: '' },
  },
  { timestamps: true }
)

export const PaymentQr = mongoose.model('PaymentQr', PaymentQrSchema)
