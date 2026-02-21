import mongoose, { Schema, Document, Model } from 'mongoose'

export type DispositionType = 'paid' | 'promise_to_pay' | 'not_reachable' | 'dispute'

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
  disposition?: DispositionType | null
  promiseToPayDate?: Date | null
  optOutDetected?: boolean
  dispatchedAt?: Date | null
  rawPayload?: Record<string, unknown>
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
    recordingUrl: { type: String },
    disposition: { type: String, enum: ['paid', 'promise_to_pay', 'not_reachable', 'dispute'] },
    promiseToPayDate: { type: Date },
    optOutDetected: { type: Boolean, default: false },
    dispatchedAt: { type: Date },
    rawPayload: { type: Schema.Types.Mixed }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

export const CallLog: Model<ICallLog> =
  mongoose.models.CallLog || mongoose.model<ICallLog>('CallLog', CallLogSchema)

