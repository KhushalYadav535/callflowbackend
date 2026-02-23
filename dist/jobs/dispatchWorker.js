"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDispatchCycle = runDispatchCycle;
const axios_1 = __importDefault(require("axios"));
const mongoose_1 = __importDefault(require("mongoose"));
const DispatchQueue_1 = require("../models/DispatchQueue");
const AccountProfile_1 = require("../models/AccountProfile");
const Company_1 = require("../models/Company");
const eventWriter_1 = require("../services/eventWriter");
const DISPATCH_INTERVAL_MIN = Number(process.env.DISPATCH_WORKER_INTERVAL_MINUTES) || 5;
const MAX_DISPATCH_RETRIES = 3;
const RATE_LIMIT_PER_MIN = Number(process.env.DISPATCH_RATE_LIMIT_PER_MINUTE) || 60;
async function runDispatchCycle() {
    const companies = await mongoose_1.default.connection.db
        ?.collection('companies')
        .find({})
        .project({ _id: 1 })
        .toArray();
    if (!companies?.length)
        return { dispatched: 0, failed: 0 };
    let totalDispatched = 0;
    let totalFailed = 0;
    for (const c of companies) {
        const companyId = c._id;
        const company = await Company_1.Company.findById(companyId);
        const n8nUrl = company?.n8nWebhookUrl;
        if (!n8nUrl)
            continue;
        const items = await DispatchQueue_1.DispatchQueue.find({ companyId })
            .sort({ nextDispatchAt: 1 })
            .limit(RATE_LIMIT_PER_MIN)
            .populate('accountId')
            .populate('botConfigId');
        for (const item of items) {
            const account = item.accountId;
            const bot = item.botConfigId;
            if (!account || !bot) {
                await DispatchQueue_1.DispatchQueue.deleteOne({ _id: item._id });
                totalFailed++;
                continue;
            }
            const payload = {
                accountId: String(account._id),
                companyId: String(companyId),
                name: account.customerName,
                phone: account.phone,
                amount: account.outstandingAmount ?? 0,
                dueDate: account.dueDate,
                productType: account.productType,
                dpd: account.dpd ?? 0,
                botConfigId: String(bot._id),
                offering: bot.offeringId,
                triggerReason: item.triggerReason || 'rule_match',
                voice: bot.script?.voice ?? 'sonia',
                language: bot.script?.language ?? 'hi-IN',
                promptTemplate: bot.script?.promptTemplate,
                dispositionOptions: bot.dispositions?.map((d) => ({ value: d.value, label: d.label })) ?? []
            };
            try {
                await axios_1.default.post(n8nUrl, payload, { timeout: 10000 });
                const now = new Date();
                await AccountProfile_1.AccountProfile.updateOne({ _id: account._id }, { $set: { lastCalledAt: now }, $inc: { callCount: 1 } });
                await DispatchQueue_1.DispatchQueue.deleteOne({ _id: item._id });
                await (0, eventWriter_1.writeCallEvent)({
                    companyId,
                    accountId: account._id,
                    botConfigId: bot._id,
                    offeringId: bot.offeringId,
                    eventType: 'CALL_DISPATCHED',
                    payload: {
                        accountId: String(account._id),
                        botConfigId: String(bot._id),
                        offering: bot.offeringId,
                        dispatchedAt: now,
                        triggerReason: item.triggerReason
                    },
                    source: 'system',
                    timestamp: now
                });
                totalDispatched++;
            }
            catch (err) {
                const retryCount = (item.retryCount ?? 0) + 1;
                const errMsg = err instanceof Error ? err.message : 'Unknown error';
                if (retryCount >= MAX_DISPATCH_RETRIES) {
                    await DispatchQueue_1.DispatchQueue.deleteOne({ _id: item._id });
                    await (0, eventWriter_1.writeCallEvent)({
                        companyId,
                        accountId: account._id,
                        botConfigId: bot._id,
                        offeringId: bot.offeringId,
                        eventType: 'DISPATCH_FAILED',
                        payload: { attemptCount: retryCount, lastError: errMsg },
                        source: 'system',
                        timestamp: new Date()
                    });
                    totalFailed++;
                }
                else {
                    await DispatchQueue_1.DispatchQueue.updateOne({ _id: item._id }, {
                        $set: {
                            retryCount,
                            lastError: errMsg,
                            nextDispatchAt: new Date(Date.now() + 5 * 60 * 1000)
                        }
                    });
                }
            }
        }
    }
    return { dispatched: totalDispatched, failed: totalFailed };
}
