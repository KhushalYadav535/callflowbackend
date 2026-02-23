"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotConfig = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const TriggerConditionSchema = new mongoose_1.Schema({
    field: { type: String, required: true },
    operator: {
        type: String,
        enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'within_days', 'past_days', 'in'],
        required: true
    },
    value: { type: mongoose_1.Schema.Types.Mixed }
}, { _id: false });
const TriggerRuleSchema = new mongoose_1.Schema({
    conditions: [TriggerConditionSchema],
    groups: [{ conditions: [TriggerConditionSchema] }]
}, { _id: false });
const ScriptConfigSchema = new mongoose_1.Schema({
    voice: String,
    language: String,
    promptTemplate: String,
    variables: [String]
}, { _id: false });
const DispositionOptionSchema = new mongoose_1.Schema({
    value: { type: String, required: true },
    label: { type: String, required: true },
    action: { type: String, required: true },
    terminal: { type: Boolean, required: true }
}, { _id: false });
const RetryRulesSchema = new mongoose_1.Schema({
    maxAttempts: Number,
    intervalHours: Number,
    excludeDays: [Number],
    coolOffHours: Number
}, { _id: false });
const ComplianceConfigSchema = new mongoose_1.Schema({
    callingWindow: { start: String, end: String },
    timezone: String,
    dndCheck: Boolean,
    maxAttemptsPerDay: Number
}, { _id: false });
const AmountFilterSchema = new mongoose_1.Schema({ min: Number, max: Number }, { _id: false });
const BotConfigSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', default: null },
    offeringId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    isTemplate: { type: Boolean, required: true },
    isActive: { type: Boolean, required: true, default: true },
    trigger: { type: TriggerRuleSchema, required: true },
    script: { type: ScriptConfigSchema, required: true },
    dispositions: { type: [DispositionOptionSchema], required: true },
    retryRules: { type: RetryRulesSchema, required: true },
    compliance: { type: ComplianceConfigSchema, required: true },
    escalation: { type: mongoose_1.Schema.Types.Mixed },
    capabilities: { type: mongoose_1.Schema.Types.Mixed },
    productFilter: [String],
    amountFilter: AmountFilterSchema,
    isDeprecated: { type: Boolean, default: false },
    version: { type: String },
    parentTemplateId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'BotConfig' },
    createdBy: String
}, { timestamps: { createdAt: true, updatedAt: true } });
BotConfigSchema.index({ companyId: 1, offeringId: 1 });
BotConfigSchema.index({ isTemplate: 1 });
exports.BotConfig = mongoose_1.default.models.BotConfig || mongoose_1.default.model('BotConfig', BotConfigSchema);
