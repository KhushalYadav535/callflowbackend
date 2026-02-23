import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IAccountNote extends Document {
  accountId: mongoose.Types.ObjectId
  companyId: mongoose.Types.ObjectId
  note: string
  createdBy: string
  createdAt: Date
}

const AccountNoteSchema = new Schema<IAccountNote>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'AccountProfile', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    note: { type: String, required: true },
    createdBy: { type: String, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

AccountNoteSchema.index({ accountId: 1, createdAt: -1 })

export const AccountNote: Model<IAccountNote> =
  mongoose.models.AccountNote || mongoose.model<IAccountNote>('AccountNote', AccountNoteSchema)
