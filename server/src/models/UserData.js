import mongoose from "mongoose";

const UserDataSchema = new mongoose.Schema(
  {
    accountKey: { type: String, required: true, unique: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true, versionKey: false },
);

export const UserData = mongoose.model("UserData", UserDataSchema);
