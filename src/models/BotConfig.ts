import mongoose, { Schema, Document, Model } from 'mongoose'

export interface ITriggerCondition {
  field: string
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'within_days' | 'past_days' | 'in'
  value: unknown
}

export interface ITriggerRule {
  conditions: ITriggerCondition[]
  groups?: { conditions: ITriggerCondition[] }[] // OR groups
}

export interface IScriptConfig {
  voice?: string
  language?: string
  promptTemplate?: string
  variables?: string[]
}

export interface IDispositionOption {
  value: string
  label: string
  action: string
  terminal: boolean
}

export interface IRetryRules {
  maxAttempts?: number
  intervalHours?: number
  excludeDays?: number[]
  coolOffHours?: number
}

export interface IComplianceConfig {
  callingWindow?: { start: string; end: string }
  timezone?: string
  dndCheck?: boolean
  maxAttemptsPerDay?: number
}

export interface IAmountFilter {
  min?: number
  max?: number
}

export interface IBotConfig extends Document {
  companyId: mongoose.Types.ObjectId | null
  offeringId: string
  name: string
  isTemplate: boolean
  isActive: boolean
  trigger: ITriggerRule
  script: IScriptConfig
  dispositions: IDispositionOption[]
  retryRules: IRetryRules
  compliance: IComplianceConfig
  escalation?: Record<string, unknown>
  capabilities?: Record<string, boolean>
  productFilter?: string[]
  amountFilter?: IAmountFilter
  isDeprecated?: boolean
  version?: string
  parentTemplateId?: mongoose.Types.ObjectId | null
  createdBy?: string
  createdAt: Date
  updatedAt: Date
}

const TriggerConditionSchema = new Schema(
  {
    field: { type: String, required: true },
    operator: {
      type: String,
      enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'within_days', 'past_days', 'in'],
      required: true
    },
    value: { type: Schema.Types.Mixed }
  },
  { _id: false }
)

const TriggerRuleSchema = new Schema(
  {
    conditions: [TriggerConditionSchema],
    groups: [{ conditions: [TriggerConditionSchema] }]
  },
  { _id: false }
)

const ScriptConfigSchema = new Schema(
  {
    voice: String,
    language: String,
    promptTemplate: String,
    variables: [String]
  },
  { _id: false }
)

const DispositionOptionSchema = new Schema(
  {
    value: { type: String, required: true },
    label: { type: String, required: true },
    action: { type: String, required: true },
    terminal: { type: Boolean, required: true }
  },
  { _id: false }
)

const RetryRulesSchema = new Schema(
  {
    maxAttempts: Number,
    intervalHours: Number,
    excludeDays: [Number],
    coolOffHours: Number
  },
  { _id: false }
)

const ComplianceConfigSchema = new Schema(
  {
    callingWindow: { start: String, end: String },
    timezone: String,
    dndCheck: Boolean,
    maxAttemptsPerDay: Number
  },
  { _id: false }
)

const AmountFilterSchema = new Schema({ min: Number, max: Number }, { _id: false })

const BotConfigSchema = new Schema<IBotConfig>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null },
    offeringId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    isTemplate: { type: Boolean, required: true },
    isActive: { type: Boolean, required: true, default: true },
    trigger: { type: TriggerRuleSchema, required: true },
    script: { type: ScriptConfigSchema, required: true },
    dispositions: { type: [DispositionOptionSchema], required: true },
    retryRules: { type: RetryRulesSchema, required: true },
    compliance: { type: ComplianceConfigSchema, required: true },
    escalation: { type: Schema.Types.Mixed },
    capabilities: { type: Schema.Types.Mixed },
    productFilter: [String],
    amountFilter: AmountFilterSchema,
    isDeprecated: { type: Boolean, default: false },
    version: { type: String },
    parentTemplateId: { type: Schema.Types.ObjectId, ref: 'BotConfig' },
    createdBy: String
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

BotConfigSchema.index({ companyId: 1, offeringId: 1 })
BotConfigSchema.index({ isTemplate: 1 })

export const BotConfig: Model<IBotConfig> =
  mongoose.models.BotConfig || mongoose.model<IBotConfig>('BotConfig', BotConfigSchema)
