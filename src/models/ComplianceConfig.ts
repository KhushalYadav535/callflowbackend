import mongoose, { Schema, Document, Model } from 'mongoose'

const DEFAULT_OPT_OUT_KEYWORDS = [
  'stop calling',
  "don't call",
  'remove me',
  'unsubscribe',
  'band karo',
  'mat karo'
]

export interface IComplianceConfig extends Document {
  companyId: mongoose.Types.ObjectId
  callingWindowStart: string
  callingWindowEnd: string
  timezone: string
  optOutKeywords: string[]
  updatedAt: Date
}

const ComplianceConfigSchema = new Schema<IComplianceConfig>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, unique: true, index: true },
    callingWindowStart: { type: String, default: '09:00' },
    callingWindowEnd: { type: String, default: '19:00' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    optOutKeywords: { type: [String], default: DEFAULT_OPT_OUT_KEYWORDS }
  },
  { timestamps: { createdAt: false, updatedAt: true } }
)

export const ComplianceConfig: Model<IComplianceConfig> =
  mongoose.models.ComplianceConfig || mongoose.model<IComplianceConfig>('ComplianceConfig', ComplianceConfigSchema)

export { DEFAULT_OPT_OUT_KEYWORDS }
