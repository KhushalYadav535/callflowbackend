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
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const CallEvent_1 = require("../models/CallEvent");
const funnelService_1 = require("../services/funnelService");
const mongoose_1 = __importDefault(require("mongoose"));
const router = (0, express_1.Router)();
// GET /api/analytics/funnel - Funnel analysis (CF2-ANA-001)
router.get('/funnel', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = new mongoose_1.default.Types.ObjectId(req.companyId);
        const { offeringId, botConfigId, dateFrom, dateTo, groupBy } = req.query;
        const data = await (0, funnelService_1.getFunnelData)(companyId, {
            offeringId: offeringId ? String(offeringId) : undefined,
            botConfigId: botConfigId ? String(botConfigId) : undefined,
            dateFrom: dateFrom ? String(dateFrom) : undefined,
            dateTo: dateTo ? String(dateTo) : undefined,
            groupBy: groupBy ? String(groupBy) : undefined
        });
        res.json(data);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to compute funnel' });
    }
});
// GET /api/analytics/trends - Trend reports
router.get('/trends', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { reportType = 'connect_rate', offeringId, dateFrom, dateTo, granularity = 'daily' } = req.query;
        const match = { companyId: new mongoose_1.default.Types.ObjectId(companyId) };
        if (offeringId)
            match.offeringId = String(offeringId);
        if (dateFrom || dateTo) {
            match.timestamp = {};
            if (dateFrom)
                match.timestamp.$gte = new Date(String(dateFrom));
            if (dateTo)
                match.timestamp.$lte = new Date(String(dateTo));
        }
        const formatKey = granularity === 'daily'
            ? { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
            : granularity === 'weekly'
                ? { $dateToString: { format: '%Y-W%V', date: '$timestamp' } }
                : { $dateToString: { format: '%Y-%m', date: '$timestamp' } };
        if (reportType === 'connect_rate') {
            const [dispByDate, connByDate] = await Promise.all([
                CallEvent_1.CallEvent.aggregate([
                    { $match: { ...match, eventType: 'CALL_DISPATCHED' } },
                    { $group: { _id: formatKey, count: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ]),
                CallEvent_1.CallEvent.aggregate([
                    { $match: { ...match, eventType: 'CALL_CONNECTED' } },
                    { $group: { _id: formatKey, count: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ])
            ]);
            const dispMap = Object.fromEntries(dispByDate.map((d) => [d._id, d.count]));
            const data = connByDate.map((c) => ({
                date: c._id,
                connected: c.count,
                dispatched: dispMap[c._id] ?? 0,
                connectRate: dispMap[c._id] ? Math.round((c.count / dispMap[c._id]) * 1000) / 10 : 0
            }));
            return res.json({ reportType: 'connect_rate', granularity, data });
        }
        if (reportType === 'disposition_breakdown') {
            const [total, byDate] = await Promise.all([
                CallEvent_1.CallEvent.countDocuments({ ...match, eventType: 'DISPOSITION_SET' }),
                CallEvent_1.CallEvent.aggregate([
                    { $match: { ...match, eventType: 'DISPOSITION_SET' } },
                    { $group: { _id: { disposition: '$payload.disposition', date: { $dateToString: { format: granularity === 'daily' ? '%Y-%m-%d' : granularity === 'weekly' ? '%Y-W%V' : '%Y-%m', date: '$timestamp' } } }, count: { $sum: 1 } } },
                    { $sort: { '_id.date': 1 } }
                ])
            ]);
            const byDisposition = {};
            const byDateMap = {};
            for (const row of byDate) {
                const disp = row._id.disposition ?? 'unknown';
                const d = row._id.date;
                byDisposition[disp] = (byDisposition[disp] ?? 0) + row.count;
                if (!byDateMap[d])
                    byDateMap[d] = {};
                byDateMap[d][disp] = row.count;
            }
            return res.json({
                reportType: 'disposition_breakdown',
                granularity,
                total,
                byDisposition,
                byDate: Object.entries(byDateMap).map(([date, dispCounts]) => ({ date, ...dispCounts }))
            });
        }
        if (reportType === 'opt_out_trend') {
            const [optOutByDate, keywordBreakdown] = await Promise.all([
                CallEvent_1.CallEvent.aggregate([
                    { $match: { ...match, eventType: 'OPT_OUT_DETECTED' } },
                    { $group: { _id: formatKey, count: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ]),
                CallEvent_1.CallEvent.aggregate([
                    { $match: { ...match, eventType: 'OPT_OUT_DETECTED', 'payload.keyword': { $exists: true, $ne: null } } },
                    { $group: { _id: '$payload.keyword', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 20 }
                ])
            ]);
            return res.json({
                reportType: 'opt_out_trend',
                granularity,
                data: optOutByDate.map((r) => ({ date: r._id, optOutCount: r.count })),
                topKeywords: keywordBreakdown.map((k) => ({ keyword: k._id ?? 'unknown', count: k.count }))
            });
        }
        if (reportType === 'latency') {
            const pipeline = [
                { $match: { ...match, eventType: 'CALL_INITIATED', vapiCallId: { $exists: true, $ne: null } } },
                { $lookup: { from: 'callevents', let: { vc: '$vapiCallId', cid: '$companyId' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$vapiCallId', '$$vc'] }, { $eq: ['$companyId', '$$cid'] }, { $eq: ['$eventType', 'CALL_CONNECTED'] }] } } }, { $project: { timestamp: 1 } }], as: 'conn' } },
                { $unwind: { path: '$conn', preserveNullAndEmptyArrays: false } },
                { $project: { latencySeconds: { $divide: [{ $subtract: ['$conn.timestamp', '$timestamp'] }, 1000] } } },
                { $group: { _id: null, latencies: { $push: '$latencySeconds' } } }
            ];
            const result = await CallEvent_1.CallEvent.aggregate(pipeline);
            const latencies = result[0]?.latencies ?? [];
            latencies.sort((a, b) => a - b);
            const p = (percentile) => {
                if (latencies.length === 0)
                    return 0;
                const idx = Math.ceil((percentile / 100) * latencies.length) - 1;
                return Math.round((latencies[Math.max(0, idx)] ?? 0) * 10) / 10;
            };
            return res.json({
                reportType: 'latency',
                p50: p(50),
                p90: p(90),
                p99: p(99),
                sampleCount: latencies.length
            });
        }
        if (reportType === 'retry_effectiveness') {
            const retries = await CallEvent_1.CallEvent.find({ ...match, eventType: 'RETRY_SCHEDULED' }).select('accountId contactId').lean();
            let connected = 0;
            for (const r of retries) {
                const q = { ...match, eventType: 'CALL_CONNECTED' };
                if (r.accountId)
                    q.accountId = r.accountId;
                else if (r.contactId)
                    q.contactId = r.contactId;
                else
                    continue;
                const found = await CallEvent_1.CallEvent.findOne(q);
                if (found)
                    connected++;
            }
            const total = retries.length;
            return res.json({
                reportType: 'retry_effectiveness',
                totalRetries: total,
                eventuallyConnected: connected,
                connectRate: total > 0 ? Math.round((connected / total) * 1000) / 10 : 0
            });
        }
        res.json({ reportType: String(reportType), data: [] });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to compute trends' });
    }
});
// GET /api/analytics/bot-comparison - Side-by-side connect rate and PTP rate per BotConfig (CF2-ANA-002)
router.get('/bot-comparison', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = new mongoose_1.default.Types.ObjectId(req.companyId);
        const { dateFrom, dateTo } = req.query;
        const match = { companyId, botConfigId: { $exists: true, $ne: null } };
        if (dateFrom || dateTo) {
            match.timestamp = {};
            if (dateFrom)
                match.timestamp.$gte = new Date(String(dateFrom));
            if (dateTo)
                match.timestamp.$lte = new Date(String(dateTo));
        }
        const [dispatchedByBot, connectedByBot, ptpByBot] = await Promise.all([
            CallEvent_1.CallEvent.aggregate([
                { $match: { ...match, eventType: 'CALL_DISPATCHED' } },
                { $group: { _id: '$botConfigId', count: { $sum: 1 } } }
            ]),
            CallEvent_1.CallEvent.aggregate([
                { $match: { ...match, eventType: 'CALL_CONNECTED' } },
                { $group: { _id: '$botConfigId', count: { $sum: 1 } } }
            ]),
            CallEvent_1.CallEvent.aggregate([
                { $match: { ...match, eventType: 'DISPOSITION_SET', 'payload.disposition': { $in: ['promise_to_pay', 'promise to pay'] } } },
                { $group: { _id: '$botConfigId', count: { $sum: 1 } } }
            ])
        ]);
        const { BotConfig } = await Promise.resolve().then(() => __importStar(require('../models/BotConfig')));
        const botConfigs = await BotConfig.find({ companyId, isTemplate: false }).select('_id name offeringId').lean();
        const dispMap = Object.fromEntries(dispatchedByBot.map((d) => [String(d._id), d.count]));
        const connMap = Object.fromEntries(connectedByBot.map((c) => [String(c._id), c.count]));
        const ptpMap = Object.fromEntries(ptpByBot.map((p) => [String(p._id), p.count]));
        const rows = botConfigs.map((b) => {
            const disp = dispMap[b._id.toString()] ?? 0;
            const conn = connMap[b._id.toString()] ?? 0;
            const ptp = ptpMap[b._id.toString()] ?? 0;
            return {
                botConfigId: b._id,
                name: b.name,
                offeringId: b.offeringId,
                dispatched: disp,
                connected: conn,
                connectRate: disp > 0 ? Math.round((conn / disp) * 1000) / 10 : 0,
                ptpCount: ptp,
                ptpRate: conn > 0 ? Math.round((ptp / conn) * 1000) / 10 : 0
            };
        });
        res.json({ bots: rows });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to compute bot comparison' });
    }
});
exports.default = router;
