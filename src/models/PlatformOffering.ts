import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IPlatformOffering extends Document {
  offeringId: string
  name: string
  description?: string
  isAvailable: boolean
  version?: string
  capabilities?: string[]
  requiredDataFields?: string[]
  createdAt: Date
  updatedAt: Date
}

const PlatformOfferingSchema = new Schema<IPlatformOffering>(
  {
    offeringId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    isAvailable: { type: Boolean, required: true, default: true },
    version: { type: String, default: '1.0.0' },
    capabilities: [String],
    requiredDataFields: [String]
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

export const PlatformOffering: Model<IPlatformOffering> =
  mongoose.models.PlatformOffering || mongoose.model<IPlatformOffering>('PlatformOffering', PlatformOfferingSchema)
