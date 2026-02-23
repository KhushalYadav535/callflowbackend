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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.countMatchingAccounts = countMatchingAccounts;
exports.runRuleEngineCycle = runRuleEngineCycle;
const mongoose_1 = __importDefault(require("mongoose"));
const AccountProfile_1 = require("../models/AccountProfile");
const BotConfig_1 = require("../models/BotConfig");
const DispatchQueue_1 = require("../models/DispatchQueue");
const DataSourceConfig_1 = require("../models/DataSourceConfig");
const offeringService_1 = require("./offeringService");
const DndList_1 = require("../models/DndList");
const phoneNormalize_1 = require("../utils/phoneNormalize");
const eventWriter_1 = require("./eventWriter");
const STALENESS_THRESHOLD_HOURS = Number(process.env.ACCOUNT_STALENESS_THRESHOLD_HOURS) || 26;
const RULE_ENGINE_INTERVAL_MIN = Number(process.env.RULE_ENGINE_INTERVAL_MINUTES) || 15;
function evalCondition(account, cond) {
    const val = account[cond.field];
    const op = cond.operator;
    const target = cond.value;
    if (op === 'eq')
        return val === target;
    if (op === 'neq')
        return val !== target;
    const numVal = typeof val === 'number' ? val : Number(val);
    const numTarget = typeof target === 'number' ? target : Number(target);
    if (op === 'gt')
        return !Number.isNaN(numVal) && !Number.isNaN(numTarget) && numVal > numTarget;
    if (op === 'gte')
        return !Number.isNaN(numVal) && !Number.isNaN(numTarget) && numVal >= numTarget;
    if (op === 'lt')
        return !Number.isNaN(numVal) && !Number.isNaN(numTarget) && numVal < numTarget;
    if (op === 'lte')
        return !Number.isNaN(numVal) && !Number.isNaN(numTarget) && numVal <= numTarget;
    if (op === 'within_days') {
        const d = val instanceof Date ? val : val ? new Date(String(val)) : null;
        if (!d || Number.isNaN(d.getTime()))
            return false;
        const days = typeof target === 'number' ? target : Number(target) || 7;
        const now = new Date();
        const diffMs = d.getTime() - now.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= days;
    }
    if (op === 'past_days') {
        const d = val instanceof Date ? val : val ? new Date(String(val)) : null;
        if (!d || Number.isNaN(d.getTime()))
            return false;
        const days = typeof target === 'number' ? target : Number(target) || 7;
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        return diffDays >= days;
    }
    if (op === 'in') {
        const arr = Array.isArray(target) ? target : [target];
        return arr.includes(val);
    }
    return false;
}
function evalTrigger(account, trigger) {
    const conditions = trigger.conditions || [];
    const groups = trigger.groups || [];
    const conditionsMatch = conditions.length === 0 || conditions.every((c) => evalCondition(account, c));
    const groupsMatch = groups.length === 0 || groups.some((g) => (g.conditions || []).every((c) => evalCondition(account, c)));
    return conditionsMatch && groupsMatch;
}
async function countMatchingAccounts(companyId, botConfigId) {
    const bot = await BotConfig_1.BotConfig.findOne({ _id: botConfigId, companyId, isTemplate: false });
    if (!bot)
        return 0;
    if (!(await (0, offeringService_1.canDispatch)(companyId, bot.offeringId)))
        return 0;
    const dsConfig = await DataSourceConfig_1.DataSourceConfig.findOne({ companyId });
    const stalenessHours = dsConfig?.stalenessThresholdHours ?? STALENESS_THRESHOLD_HOURS;
    const cutoff = new Date(Date.now() - stalenessHours * 60 * 60 * 1000);
    const dndPhones = new Set((await DndList_1.DndList.find({ companyId }).select('phoneNormalised')).map((d) => d.phoneNormalised));
    const accounts = await AccountProfile_1.AccountProfile.find({
        companyId,
        status: 'ACTIVE',
        $or: [{ dataFreshnessAt: { $gte: cutoff } }, { dataFreshnessAt: null }]
    });
    const relevantAccounts = accounts.filter((a) => !a.activeBotConfigId || a.activeBotConfigId.equals(bot._id));
    let count = 0;
    for (const acc of relevantAccounts) {
        if (dndPhones.has((0, phoneNormalize_1.normalisePhone)(acc.phone)))
            continue;
        if (acc.nextCallAt && acc.nextCallAt > new Date())
            continue;
        const accObj = {
            ...acc.toObject(),
            dpd: acc.dpd,
            dueDate: acc.dueDate,
            maturityDate: acc.maturityDate,
            kycExpiryDate: acc.kycExpiryDate,
            outstandingAmount: acc.outstandingAmount,
            productType: acc.productType,
            lastCalledAt: acc.lastCalledAt
        };
        if (!evalTrigger(accObj, bot.trigger))
            continue;
        if (bot.productFilter?.length && (!acc.productType || !bot.productFilter.includes(acc.productType)))
            continue;
        if (bot.amountFilter) {
            const amt = acc.outstandingAmount ?? 0;
            if (bot.amountFilter.min != null && amt < bot.amountFilter.min)
                continue;
            if (bot.amountFilter.max != null && amt > bot.amountFilter.max)
                continue;
        }
        count++;
    }
    return count;
}
function isWithinCallingWindow(companyId, start, end) {
    return (async () => {
        const { ComplianceConfig } = await Promise.resolve().then(() => __importStar(require('../models/ComplianceConfig')));
        const config = await ComplianceConfig.findOne({ companyId });
        const s = start ?? config?.callingWindowStart ?? '09:00';
        const e = end ?? config?.callingWindowEnd ?? '19:00';
        const now = new Date();
        const [sh, sm] = s.split(':').map(Number);
        const [eh, em] = e.split(':').map(Number);
        const currentMin = now.getHours() * 60 + now.getMinutes();
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        return currentMin >= startMin && currentMin <= endMin;
    })();
}
async function runRuleEngineCycle() {
    const companies = await mongoose_1.default.connection.db
        ?.collection('companies')
        .find({})
        .project({ _id: 1 })
        .toArray();
    if (!companies?.length)
        return { queued: 0, skipped: 0 };
    let totalQueued = 0;
    let totalSkipped = 0;
    for (const c of companies) {
        const companyId = c._id;
        const dsConfig = await DataSourceConfig_1.DataSourceConfig.findOne({ companyId });
        const stalenessHours = dsConfig?.stalenessThresholdHours ?? STALENESS_THRESHOLD_HOURS;
        const cutoff = new Date(Date.now() - stalenessHours * 60 * 60 * 1000);
        const staleCount = await AccountProfile_1.AccountProfile.countDocuments({
            companyId,
            status: { $in: ['ACTIVE', 'PAUSED'] },
            $or: [{ dataFreshnessAt: { $lt: cutoff } }, { dataFreshnessAt: null }]
        });
        if (staleCount > 0) {
            await (0, eventWriter_1.writeCallEvent)({
                companyId,
                eventType: 'ACCOUNT_STALE',
                payload: { staleCount, thresholdHours: stalenessHours },
                source: 'system',
                timestamp: new Date()
            }).catch(() => { });
        }
        const withinWindow = await isWithinCallingWindow(companyId);
        if (!withinWindow)
            continue;
        const botConfigs = await BotConfig_1.BotConfig.find({
            companyId,
            isTemplate: false,
            isActive: true
        }).sort({ createdAt: 1 });
        const dndPhones = new Set((await DndList_1.DndList.find({ companyId }).select('phoneNormalised')).map((d) => d.phoneNormalised));
        const accounts = await AccountProfile_1.AccountProfile.find({
            companyId,
            status: 'ACTIVE',
            $or: [{ dataFreshnessAt: { $gte: cutoff } }, { dataFreshnessAt: null }]
        });
        for (const bot of botConfigs) {
            if (!(await (0, offeringService_1.canDispatch)(companyId, bot.offeringId)))
                continue;
            const relevantAccounts = accounts.filter((a) => !a.activeBotConfigId || a.activeBotConfigId.equals(bot._id));
            for (const acc of relevantAccounts) {
                if (dndPhones.has((0, phoneNormalize_1.normalisePhone)(acc.phone))) {
                    totalSkipped++;
                    continue;
                }
                if (acc.nextCallAt && acc.nextCallAt > new Date()) {
                    totalSkipped++;
                    continue;
                }
                const accObj = { ...acc.toObject() };
                accObj.dpd = acc.dpd;
                accObj.dueDate = acc.dueDate;
                accObj.maturityDate = acc.maturityDate;
                accObj.kycExpiryDate = acc.kycExpiryDate;
                accObj.outstandingAmount = acc.outstandingAmount;
                accObj.productType = acc.productType;
                accObj.lastCalledAt = acc.lastCalledAt;
                if (!evalTrigger(accObj, bot.trigger)) {
                    totalSkipped++;
                    continue;
                }
                if (bot.productFilter?.length && bot.productFilter.length > 0) {
                    if (!acc.productType || !bot.productFilter.includes(acc.productType)) {
                        totalSkipped++;
                        continue;
                    }
                }
                if (bot.amountFilter) {
                    const amt = acc.outstandingAmount ?? 0;
                    if (bot.amountFilter.min != null && amt < bot.amountFilter.min) {
                        totalSkipped++;
                        continue;
                    }
                    if (bot.amountFilter.max != null && amt > bot.amountFilter.max) {
                        totalSkipped++;
                        continue;
                    }
                }
                const nextAt = new Date();
                const existing = await DispatchQueue_1.DispatchQueue.findOne({ companyId, accountId: acc._id });
                if (existing) {
                    totalSkipped++;
                    continue;
                }
                if (!acc.activeBotConfigId || !acc.activeBotConfigId.equals(bot._id)) {
                    await AccountProfile_1.AccountProfile.updateOne({ _id: acc._id }, { $set: { activeBotConfigId: bot._id } });
                }
                await DispatchQueue_1.DispatchQueue.create({
                    companyId,
                    accountId: acc._id,
                    botConfigId: bot._id,
                    offeringId: bot.offeringId,
                    triggerReason: 'rule_match',
                    nextDispatchAt: nextAt,
                    retryCount: 0
                });
                totalQueued++;
            }
        }
    }
    return { queued: totalQueued, skipped: totalSkipped };
}
