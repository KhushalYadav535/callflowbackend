import mongoose, { Schema, Document, Model } from 'mongoose'

export type UserRole = 'TENANT_ADMIN' | 'CAMPAIGN_MANAGER' | 'RECOVERY_AGENT'

export interface IUser extends Document {
  companyId: mongoose.Types.ObjectId
  email: string
  password: string
  name?: string
  role: UserRole
  createdBy?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    name: { type: String },
    role: {
      type: String,
      enum: ['TENANT_ADMIN', 'CAMPAIGN_MANAGER', 'RECOVERY_AGENT'],
      required: true,
      default: 'RECOVERY_AGENT',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

UserSchema.index({ companyId: 1, email: 1 }, { unique: true })

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema)
