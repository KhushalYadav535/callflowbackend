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
exports.CallEvent = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const CallEventSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    accountId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AccountProfile' },
    contactId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Contact' },
    campaignId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Campaign' },
    botConfigId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'BotConfig' },
    offeringId: { type: String },
    vapiCallId: { type: String, index: true },
    eventType: {
        type: String,
        enum: [
            'CALL_DISPATCHED', 'CALL_INITIATED', 'CALL_RINGING', 'CALL_CONNECTED',
            'CALL_NOT_ANSWERED', 'CALL_FAILED', 'CALL_ENDED', 'SPEECH_STARTED',
            'OPT_OUT_DETECTED', 'DISPOSITION_SET', 'RETRY_SCHEDULED', 'MANUAL_OVERRIDE',
            'DISPATCH_FAILED', 'SYNC_FAILED', 'ACCOUNT_STALE', 'OFFERING_TOGGLED'
        ],
        required: true,
        index: true
    },
    payload: { type: mongoose_1.Schema.Types.Mixed, required: true },
    source: {
        type: String,
        enum: ['system', 'webhook', 'agent', 'platform_admin'],
        required: true
    },
    timestamp: { type: Date, required: true, index: true }
}, { timestamps: { createdAt: true, updatedAt: false } });
CallEventSchema.index({ companyId: 1, timestamp: -1 });
CallEventSchema.index({ accountId: 1, timestamp: -1 });
exports.CallEvent = mongoose_1.default.models.CallEvent || mongoose_1.default.model('CallEvent', CallEventSchema);
