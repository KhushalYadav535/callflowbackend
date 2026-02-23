import mongoose, { Schema, Document, Model } from 'mongoose'

export type CallEventType =
  | 'CALL_DISPATCHED'
  | 'CALL_INITIATED'
  | 'CALL_RINGING'
  | 'CALL_CONNECTED'
  | 'CALL_NOT_ANSWERED'
  | 'CALL_FAILED'
  | 'CALL_ENDED'
  | 'SPEECH_STARTED'
  | 'OPT_OUT_DETECTED'
  | 'DISPOSITION_SET'
  | 'RETRY_SCHEDULED'
  | 'MANUAL_OVERRIDE'
  | 'DISPATCH_FAILED'
  | 'SYNC_FAILED'
  | 'ACCOUNT_STALE'
  | 'OFFERING_TOGGLED'

export type EventSource = 'system' | 'webhook' | 'agent' | 'platform_admin'

export interface ICallEvent extends Document {
  companyId: mongoose.Types.ObjectId
  accountId?: mongoose.Types.ObjectId | null
  contactId?: mongoose.Types.ObjectId | null
  campaignId?: mongoose.Types.ObjectId | null
  botConfigId?: mongoose.Types.ObjectId | null
  offeringId?: string | null
  vapiCallId?: string | null
  eventType: CallEventType
  payload: Record<string, unknown>
  source: EventSource
  timestamp: Date
  createdAt: Date
}

const CallEventSchema = new Schema<ICallEvent>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'AccountProfile' },
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact' },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign' },
    botConfigId: { type: Schema.Types.ObjectId, ref: 'BotConfig' },
    offeringId: { type: String },
    vapiCallId: { type: String, index: true },
    eventType: {
      type: String,
      enum: [
        'CALL_DISPATCHED', 'CALL_INITIATED', 'CALL_RINGING', 'CALL_CONNECTED',
        'CALL_NOT_ANSWERED', 'CALL_FAILED', 'CALL_ENDED', 'SPEECH_STARTED',
        'OPT_OUT_DETECTED', 'DISPOSITION_SET', 'RETRY_SCHEDULED', 'MANUAL_OVERRIDE',
        'DISPATCH_FAILED', 'SYNC_FAILED', 'ACCOUNT_STALE', 'OFFERING_TOGGLED'
      ],
      required: true,
      index: true
    },
    payload: { type: Schema.Types.Mixed, required: true },
    source: {
      type: String,
      enum: ['system', 'webhook', 'agent', 'platform_admin'],
      required: true
    },
    timestamp: { type: Date, required: true, index: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

CallEventSchema.index({ companyId: 1, timestamp: -1 })
CallEventSchema.index({ accountId: 1, timestamp: -1 })

export const CallEvent: Model<ICallEvent> =
  mongoose.models.CallEvent || mongoose.model<ICallEvent>('CallEvent', CallEventSchema)
