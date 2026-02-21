import mongoose, { Schema, Document, Model } from 'mongoose'

export type CallStatus =
  | 'PENDING'
  | 'CALLING'
  | 'CONNECTED'
  | 'NOT_ANSWERED'
  | 'FAILED'
  | 'MAX_RETRY_DONE'
  | 'PAID'
  | 'OPT_OUT'
  | 'DND_EXCLUDED'
  | 'WITHDRAWN'
  | 'REASSIGNED'

export type PaymentDisposition = 'paid' | 'promise_to_pay' | 'not_reachable' | 'dispute'

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
  paymentDisposition?: PaymentDisposition | null
  promiseToPayDate?: Date | null
  isDisputed?: boolean
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
      enum: ['PENDING', 'CALLING', 'CONNECTED', 'NOT_ANSWERED', 'FAILED', 'MAX_RETRY_DONE', 'PAID', 'OPT_OUT', 'DND_EXCLUDED', 'WITHDRAWN', 'REASSIGNED'],
      default: 'PENDING',
      index: true
    },
    paymentDisposition: { type: String, enum: ['paid', 'promise_to_pay', 'not_reachable', 'dispute'] },
    promiseToPayDate: { type: Date },
    isDisputed: { type: Boolean, default: false },
    retryCount: { type: Number, default: 0 },
    lastCalledAt: { type: Date },
    nextRetryAt: { type: Date },
    connectedAt: { type: Date }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

export const Contact: Model<IContact> =
  mongoose.models.Contact || mongoose.model<IContact>('Contact', ContactSchema)

