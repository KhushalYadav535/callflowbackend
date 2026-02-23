"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFunnelData = getFunnelData;
const mongoose_1 = __importDefault(require("mongoose"));
const CallEvent_1 = require("../models/CallEvent");
async function getFunnelData(companyId, params) {
    const { offeringId, botConfigId, dateFrom, dateTo, groupBy } = params;
    const match = { companyId };
    if (offeringId)
        match.offeringId = offeringId;
    if (botConfigId)
        match.botConfigId = new mongoose_1.default.Types.ObjectId(botConfigId);
    if (dateFrom || dateTo) {
        match.timestamp = {};
        if (dateFrom)
            match.timestamp.$gte = new Date(dateFrom);
        if (dateTo)
            match.timestamp.$lte = new Date(dateTo);
    }
    const groupByVal = groupBy === 'productType' || groupBy === 'language' ? groupBy : null;
    const [dispatched, initiated, connected, notAnswered, optOutCount, dispositionEvents, avgDurationResult, byGroup] = await Promise.all([
        CallEvent_1.CallEvent.countDocuments({ ...match, eventType: 'CALL_DISPATCHED' }),
        CallEvent_1.CallEvent.countDocuments({ ...match, eventType: 'CALL_INITIATED' }),
        CallEvent_1.CallEvent.countDocuments({ ...match, eventType: 'CALL_CONNECTED' }),
        CallEvent_1.CallEvent.countDocuments({ ...match, eventType: 'CALL_NOT_ANSWERED' }),
        CallEvent_1.CallEvent.countDocuments({ ...match, eventType: 'OPT_OUT_DETECTED' }),
        CallEvent_1.CallEvent.aggregate([
            { $match: { ...match, eventType: 'DISPOSITION_SET' } },
            { $group: { _id: '$payload.disposition', count: { $sum: 1 } } }
        ]),
        CallEvent_1.CallEvent.aggregate([
            { $match: { ...match, eventType: 'CALL_ENDED', 'payload.totalDuration': { $exists: true, $ne: null } } },
            { $group: { _id: null, avg: { $avg: '$payload.totalDuration' } } }
        ]),
        groupByVal
            ? CallEvent_1.CallEvent.aggregate([
                { $match: { ...match, eventType: 'CALL_DISPATCHED' } },
                { $lookup: { from: 'accountprofiles', localField: 'accountId', foreignField: '_id', as: 'acc', pipeline: [{ $project: { productType: 1, language: 1 } }] } },
                { $lookup: { from: 'contacts', localField: 'contactId', foreignField: '_id', as: 'con', pipeline: [{ $project: { loanType: 1 } }] } },
                {
                    $addFields: {
                        groupVal: groupByVal === 'productType'
                            ? { $ifNull: [{ $arrayElemAt: ['$acc.productType', 0] }, { $arrayElemAt: ['$con.loanType', 0] }] }
                            : { $ifNull: [{ $arrayElemAt: ['$acc.language', 0] }, 'unknown'] }
                    }
                },
                { $group: { _id: { $ifNull: ['$groupVal', 'unknown'] }, dispatched: { $sum: 1 } } }
            ])
            : Promise.resolve([])
    ]);
    const dispositions = {};
    for (const d of dispositionEvents) {
        dispositions[d._id ?? 'unknown'] = d.count;
    }
    const connectRate = dispatched > 0 ? Math.round((connected / dispatched) * 1000) / 10 : 0;
    const avgCallDuration = avgDurationResult[0]?.avg != null ? Math.round(Number(avgDurationResult[0].avg) * 10) / 10 : 0;
    const response = {
        dispatched,
        initiated,
        connected,
        notAnswered,
        connectRate,
        dispositions,
        optOutCount,
        avgCallDuration
    };
    if (groupByVal && byGroup.length) {
        response.byGroup = byGroup.map((g) => ({
            groupValue: g._id ?? 'unknown',
            dispatched: g.dispatched ?? 0
        }));
    }
    return response;
}
