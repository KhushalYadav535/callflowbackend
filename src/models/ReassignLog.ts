import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IReassignLog extends Document {
  contactId: mongoose.Types.ObjectId
  campaignId: mongoose.Types.ObjectId
  companyId: mongoose.Types.ObjectId
  targetCampaignId: mongoose.Types.ObjectId
  newContactId: mongoose.Types.ObjectId
  updatedBy: string
  createdAt: Date
}

const ReassignLogSchema = new Schema<IReassignLog>(
  {
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    targetCampaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    newContactId: { type: Schema.Types.ObjectId, ref: 'Contact', required: true },
    updatedBy: { type: String, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

export const ReassignLog: Model<IReassignLog> =
  mongoose.models.ReassignLog || mongoose.model<IReassignLog>('ReassignLog', ReassignLogSchema)
