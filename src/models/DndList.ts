import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IDndList extends Document {
  companyId: mongoose.Types.ObjectId
  phoneNormalised: string
  phoneRaw?: string
  addedAt: Date
}

const DndListSchema = new Schema<IDndList>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    phoneNormalised: { type: String, required: true },
    phoneRaw: { type: String },
    addedAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
)

DndListSchema.index({ companyId: 1, phoneNormalised: 1 }, { unique: true })

export const DndList: Model<IDndList> =
  mongoose.models.DndList || mongoose.model<IDndList>('DndList', DndListSchema)
