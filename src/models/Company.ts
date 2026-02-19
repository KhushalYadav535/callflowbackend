import mongoose, { Schema, Document, Model } from 'mongoose'

export interface ICompany extends Document {
  name: string
  email: string
  password: string
  companyType?: string
  vapiApiKey?: string
  vapiPhoneNumberId?: string
  n8nWebhookUrl?: string
  backendBaseUrl?: string
  createdAt: Date
}

const CompanySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    companyType: { type: String },
    vapiApiKey: { type: String },
    vapiPhoneNumberId: { type: String },
    n8nWebhookUrl: { type: String },
    backendBaseUrl: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

export const Company: Model<ICompany> =
  mongoose.models.Company || mongoose.model<ICompany>('Company', CompanySchema)

