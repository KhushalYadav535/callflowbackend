import mongoose, { Schema, Document, Model } from 'mongoose'

export type AccountStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'EXCLUDED'

export interface IAccountProfile extends Document {
  companyId: mongoose.Types.ObjectId
  externalAccountId: string
  customerName: string
  phone: string
  altPhone?: string
  email?: string
  language?: string
  productType?: string
  outstandingAmount?: number
  dpd: number
  dueDate?: Date | null
  maturityDate?: Date | null
  kycExpiryDate?: Date | null
  activeBotConfigId?: mongoose.Types.ObjectId | null
  status: AccountStatus
  lastCalledAt?: Date | null
  nextCallAt?: Date | null
  dataFreshnessAt?: Date | null
  callCount: number
  createdAt: Date
  updatedAt: Date
}

const AccountProfileSchema = new Schema<IAccountProfile>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    externalAccountId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    altPhone: { type: String },
    email: { type: String },
    language: { type: String, default: 'hi-IN' },
    productType: { type: String },
    outstandingAmount: { type: Number },
    dpd: { type: Number, default: 0 },
    dueDate: { type: Date },
    maturityDate: { type: Date },
    kycExpiryDate: { type: Date },
    activeBotConfigId: { type: Schema.Types.ObjectId, ref: 'BotConfig' },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'COMPLETED', 'EXCLUDED'],
      default: 'ACTIVE',
      index: true
    },
    lastCalledAt: { type: Date },
    nextCallAt: { type: Date },
    dataFreshnessAt: { type: Date },
    callCount: { type: Number, default: 0 }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

AccountProfileSchema.index({ companyId: 1, externalAccountId: 1 }, { unique: true })
AccountProfileSchema.index({ companyId: 1, status: 1 })

export const AccountProfile: Model<IAccountProfile> =
  mongoose.models.AccountProfile || mongoose.model<IAccountProfile>('AccountProfile', AccountProfileSchema)
