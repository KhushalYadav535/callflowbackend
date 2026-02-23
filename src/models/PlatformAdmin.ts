import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IPlatformAdmin extends Document {
  email: string
  password: string
  name?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const PlatformAdminSchema = new Schema<IPlatformAdmin>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    name: { type: String },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

export const PlatformAdmin: Model<IPlatformAdmin> =
  mongoose.models.PlatformAdmin || mongoose.model<IPlatformAdmin>('PlatformAdmin', PlatformAdminSchema)
