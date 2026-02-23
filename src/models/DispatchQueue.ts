import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IDispatchQueue extends Document {
  companyId: mongoose.Types.ObjectId
  accountId: mongoose.Types.ObjectId
  botConfigId: mongoose.Types.ObjectId
  offeringId: string
  triggerReason?: string
  nextDispatchAt: Date
  retryCount: number
  lastError?: string | null
  createdAt: Date
}

const DispatchQueueSchema = new Schema<IDispatchQueue>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'AccountProfile', required: true, index: true },
    botConfigId: { type: Schema.Types.ObjectId, ref: 'BotConfig', required: true },
    offeringId: { type: String, required: true },
    triggerReason: { type: String },
    nextDispatchAt: { type: Date, required: true, index: true },
    retryCount: { type: Number, default: 0 },
    lastError: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

DispatchQueueSchema.index({ companyId: 1, accountId: 1 }, { unique: true })
DispatchQueueSchema.index({ nextDispatchAt: 1 })

export const DispatchQueue: Model<IDispatchQueue> =
  mongoose.models.DispatchQueue || mongoose.model<IDispatchQueue>('DispatchQueue', DispatchQueueSchema)
