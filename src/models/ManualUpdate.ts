import mongoose, { Schema, Document, Model } from 'mongoose'

export type DispositionType = 'paid' | 'promise_to_pay' | 'not_reachable' | 'dispute'

export interface IManualUpdate extends Document {
  contactId: mongoose.Types.ObjectId
  campaignId: mongoose.Types.ObjectId
  companyId: mongoose.Types.ObjectId
  updatedBy: string
  oldDisposition?: string | null
  newDisposition: DispositionType
  promiseToPayDate?: Date | null
  note?: string | null
  createdAt: Date
}

const ManualUpdateSchema = new Schema<IManualUpdate>(
  {
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    updatedBy: { type: String, required: true },
    oldDisposition: { type: String },
    newDisposition: {
      type: String,
      enum: ['paid', 'promise_to_pay', 'not_reachable', 'dispute'],
      required: true
    },
    promiseToPayDate: { type: Date },
    note: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

export const ManualUpdate: Model<IManualUpdate> =
  mongoose.models.ManualUpdate || mongoose.model<IManualUpdate>('ManualUpdate', ManualUpdateSchema)
