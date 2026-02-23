import mongoose from 'mongoose'
import { CallEvent } from '../models/CallEvent'

export async function getFunnelData(
  companyId: mongoose.Types.ObjectId,
  params: { offeringId?: string; botConfigId?: string; dateFrom?: string; dateTo?: string; groupBy?: string }
) {
  const { offeringId, botConfigId, dateFrom, dateTo, groupBy } = params
  const match: Record<string, unknown> = { companyId }
  if (offeringId) match.offeringId = offeringId
  if (botConfigId) match.botConfigId = new mongoose.Types.ObjectId(botConfigId)
  if (dateFrom || dateTo) {
    match.timestamp = {}
    if (dateFrom) (match.timestamp as Record<string, Date>).$gte = new Date(dateFrom)
    if (dateTo) (match.timestamp as Record<string, Date>).$lte = new Date(dateTo)
  }

  const groupByVal = groupBy === 'productType' || groupBy === 'language' ? groupBy : null

  const [
    dispatched,
    initiated,
    connected,
    notAnswered,
    optOutCount,
    dispositionEvents,
    avgDurationResult,
    byGroup
  ] = await Promise.all([
    CallEvent.countDocuments({ ...match, eventType: 'CALL_DISPATCHED' }),
    CallEvent.countDocuments({ ...match, eventType: 'CALL_INITIATED' }),
    CallEvent.countDocuments({ ...match, eventType: 'CALL_CONNECTED' }),
    CallEvent.countDocuments({ ...match, eventType: 'CALL_NOT_ANSWERED' }),
    CallEvent.countDocuments({ ...match, eventType: 'OPT_OUT_DETECTED' }),
    CallEvent.aggregate([
      { $match: { ...match, eventType: 'DISPOSITION_SET' } },
      { $group: { _id: '$payload.disposition', count: { $sum: 1 } } }
    ]),
    CallEvent.aggregate([
      { $match: { ...match, eventType: 'CALL_ENDED', 'payload.totalDuration': { $exists: true, $ne: null } } },
      { $group: { _id: null, avg: { $avg: '$payload.totalDuration' } } }
    ]),
    groupByVal
      ? CallEvent.aggregate([
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
  ])

  const dispositions: Record<string, number> = {}
  for (const d of dispositionEvents) {
    dispositions[d._id ?? 'unknown'] = d.count
  }

  const connectRate = dispatched > 0 ? Math.round((connected / dispatched) * 1000) / 10 : 0
  const avgCallDuration = avgDurationResult[0]?.avg != null ? Math.round(Number(avgDurationResult[0].avg) * 10) / 10 : 0

  const response: Record<string, unknown> = {
    dispatched,
    initiated,
    connected,
    notAnswered,
    connectRate,
    dispositions,
    optOutCount,
    avgCallDuration
  }

  if (groupByVal && byGroup.length) {
    response.byGroup = byGroup.map((g: { _id?: string; dispatched?: number }) => ({
      groupValue: g._id ?? 'unknown',
      dispatched: g.dispatched ?? 0
    }))
  }

  return response
}
