import mongoose, { Schema, Document, Model } from 'mongoose'

export interface ICallLog extends Document {
  contactId: mongoose.Types.ObjectId
  campaignId: mongoose.Types.ObjectId
  companyId: mongoose.Types.ObjectId
  vapiCallId: string
  attemptNumber: number
  duration: number
  outcome: 'connected' | 'not_answered' | 'voicemail' | 'failed'
  transcript?: string
  recordingUrl?: string
  createdAt: Date
}

const CallLogSchema = new Schema<ICallLog>(
  {
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    vapiCallId: { type: String, required: true },
    attemptNumber: { type: Number, required: true },
    duration: { type: Number, default: 0 },
    outcome: {
      type: String,
      enum: ['connected', 'not_answered', 'voicemail', 'failed'],
      required: true
    },
    transcript: { type: String },
    recordingUrl: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

export const CallLog: Model<ICallLog> =
  mongoose.models.CallLog || mongoose.model<ICallLog>('CallLog', CallLogSchema)

