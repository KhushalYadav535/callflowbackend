import mongoose, { Schema, Document, Model } from 'mongoose'

export interface ICampaign extends Document {
  companyId: mongoose.Types.ObjectId
  name: string
  type: 'RECOVERY' | 'REMINDER' | 'SALES'
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'
  voice: string
  language: string
  maxRetries: number
  retryAfterHours: number
  totalContacts: number
  createdAt: Date
}

const CampaignSchema = new Schema<ICampaign>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['RECOVERY', 'REMINDER', 'SALES'], required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'],
      default: 'DRAFT'
    },
    voice: { type: String, required: true },
    language: { type: String, required: true },
    maxRetries: { type: Number, default: 3 },
    retryAfterHours: { type: Number, default: 8 },
    totalContacts: { type: Number, default: 0 }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

export const Campaign: Model<ICampaign> =
  mongoose.models.Campaign || mongoose.model<ICampaign>('Campaign', CampaignSchema)

