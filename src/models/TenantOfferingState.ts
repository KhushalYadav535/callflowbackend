import mongoose, { Schema, Document, Model } from 'mongoose'

export interface ITenantOfferingState extends Document {
  companyId: mongoose.Types.ObjectId
  offeringId: string
  isActive: boolean
  activatedAt?: Date | null
  deactivatedAt?: Date | null
  toggledBy?: string | null
  deactivationReason?: string | null
  createdAt: Date
  updatedAt: Date
}

const TenantOfferingStateSchema = new Schema<ITenantOfferingState>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    offeringId: { type: String, required: true, index: true },
    isActive: { type: Boolean, required: true, default: true },
    activatedAt: { type: Date },
    deactivatedAt: { type: Date },
    toggledBy: { type: String },
    deactivationReason: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

TenantOfferingStateSchema.index({ companyId: 1, offeringId: 1 }, { unique: true })

export const TenantOfferingState: Model<ITenantOfferingState> =
  mongoose.models.TenantOfferingState || mongoose.model<ITenantOfferingState>('TenantOfferingState', TenantOfferingStateSchema)
