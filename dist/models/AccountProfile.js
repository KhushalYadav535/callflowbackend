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
exports.AccountProfile = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const AccountProfileSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    externalAccountId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    altPhone: { type: String },
    email: { type: String },
    language: { type: String, default: 'hi-IN' },
    productType: { type: String },
    outstandingAmount: { type: Number },
    dpd: { type: Number, default: 0 },
    dueDate: { type: Date },
    maturityDate: { type: Date },
    kycExpiryDate: { type: Date },
    activeBotConfigId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'BotConfig' },
    status: {
        type: String,
        enum: ['ACTIVE', 'PAUSED', 'COMPLETED', 'EXCLUDED'],
        default: 'ACTIVE',
        index: true
    },
    lastCalledAt: { type: Date },
    nextCallAt: { type: Date },
    dataFreshnessAt: { type: Date },
    callCount: { type: Number, default: 0 }
}, { timestamps: { createdAt: true, updatedAt: true } });
AccountProfileSchema.index({ companyId: 1, externalAccountId: 1 }, { unique: true });
AccountProfileSchema.index({ companyId: 1, status: 1 });
exports.AccountProfile = mongoose_1.default.models.AccountProfile || mongoose_1.default.model('AccountProfile', AccountProfileSchema);
