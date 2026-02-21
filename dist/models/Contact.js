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
exports.Contact = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const ContactSchema = new mongoose_1.Schema({
    campaignId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
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
}, { timestamps: { createdAt: true, updatedAt: true } });
exports.Contact = mongoose_1.default.models.Contact || mongoose_1.default.model('Contact', ContactSchema);
