import mongoose, { Schema, Document, Model } from 'mongoose'

export type CallStatus =
  | 'PENDING'
  | 'CALLING'
  | 'CONNECTED'
  | 'NOT_ANSWERED'
  | 'FAILED'
  | 'MAX_RETRY_DONE'

export interface IContact extends Document {
  campaignId: mongoose.Types.ObjectId
  companyId: mongoose.Types.ObjectId
  name: string
  phone: string
  amount: number
  dueDate: Date | null
  loanType: string
  email: string
  city: string
  callStatus: CallStatus
  retryCount: number
  lastCalledAt?: Date | null
  nextRetryAt?: Date | null
  connectedAt?: Date | null
  createdAt: Date
}

const ContactSchema = new Schema<IContact>(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    amount: { type: Number, required: true },
    dueDate: { type: Date },
    loanType: { type: String },
    email: { type: String },
    city: { type: String },
    callStatus: {
      type: String,
      enum: ['PENDING', 'CALLING', 'CONNECTED', 'NOT_ANSWERED', 'FAILED', 'MAX_RETRY_DONE'],
      default: 'PENDING',
      index: true
    },
    retryCount: { type: Number, default: 0 },
    lastCalledAt: { type: Date },
    nextRetryAt: { type: Date },
    connectedAt: { type: Date }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

export const Contact: Model<IContact> =
  mongoose.models.Contact || mongoose.model<IContact>('Contact', ContactSchema)

