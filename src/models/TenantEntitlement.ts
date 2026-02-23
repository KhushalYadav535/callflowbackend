import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IConfigLimits {
  maxAccountsPerDay?: number
  maxCallsPerDay?: number
  allowedCapabilities?: string[]
}

export interface ITenantEntitlement extends Document {
  companyId: mongoose.Types.ObjectId
  offeringId: string
  isProvisioned: boolean
  provisionedAt?: Date | null
  provisionedBy?: string | null
  configLimits?: IConfigLimits
  expiresAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const ConfigLimitsSchema = new Schema(
  {
    maxAccountsPerDay: Number,
    maxCallsPerDay: Number,
    allowedCapabilities: [String]
  },
  { _id: false }
)

const TenantEntitlementSchema = new Schema<ITenantEntitlement>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    offeringId: { type: String, required: true, index: true },
    isProvisioned: { type: Boolean, required: true, default: true },
    provisionedAt: { type: Date },
    provisionedBy: { type: String },
    configLimits: ConfigLimitsSchema,
    expiresAt: { type: Date }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

TenantEntitlementSchema.index({ companyId: 1, offeringId: 1 }, { unique: true })

export const TenantEntitlement: Model<ITenantEntitlement> =
  mongoose.models.TenantEntitlement || mongoose.model<ITenantEntitlement>('TenantEntitlement', TenantEntitlementSchema)
