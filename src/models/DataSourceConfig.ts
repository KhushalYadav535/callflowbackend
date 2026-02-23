import mongoose, { Schema, Document, Model } from 'mongoose'

export type SyncMode = 'pull' | 'push' | 'file'
export type PullAuthType = 'api_key' | 'oauth2' | 'basic'
export type SyncStatus = 'success' | 'failed' | 'partial'

export interface IDataSourceConfig extends Document {
  companyId: mongoose.Types.ObjectId
  mode: SyncMode
  pullUrl?: string | null
  pullAuthType?: PullAuthType | null
  pullAuthConfig?: Record<string, string> | null
  pullScheduleCron?: string | null
  fieldMapping?: Record<string, string> | null
  stalenessThresholdHours: number
  lastSyncAt?: Date | null
  lastSyncStatus?: SyncStatus | null
  pushHmacSecret?: string | null
  createdAt: Date
  updatedAt: Date
}

const DataSourceConfigSchema = new Schema<IDataSourceConfig>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, unique: true },
    mode: {
      type: String,
      enum: ['pull', 'push', 'file'],
      required: true,
      default: 'file'
    },
    pullUrl: { type: String },
    pullAuthType: { type: String, enum: ['api_key', 'oauth2', 'basic'] },
    pullAuthConfig: { type: Schema.Types.Mixed },
    pullScheduleCron: { type: String },
    fieldMapping: { type: Schema.Types.Mixed },
    stalenessThresholdHours: { type: Number, default: 26 },
    lastSyncAt: { type: Date },
    lastSyncStatus: { type: String, enum: ['success', 'failed', 'partial'] },
    pushHmacSecret: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

export const DataSourceConfig: Model<IDataSourceConfig> =
  mongoose.models.DataSourceConfig || mongoose.model<IDataSourceConfig>('DataSourceConfig', DataSourceConfigSchema)
