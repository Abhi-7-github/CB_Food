import mongoose from 'mongoose'

const FoodItemSchema = new mongoose.Schema(
  {
    // mirror client: id, name, description, isVeg, price, image
    clientId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    isVeg: { type: Boolean, required: true },
    price: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, default: '' },
    imagePublicId: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

export const FoodItem = mongoose.model('FoodItem', FoodItemSchema)
