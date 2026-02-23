import { Router } from 'express'
import { authMiddleware, requireRoles, AuthRequest } from '../middleware/auth'
import { CallEvent } from '../models/CallEvent'
import { getFunnelData } from '../services/funnelService'
import mongoose from 'mongoose'

const router = Router()

// GET /api/analytics/funnel - Funnel analysis (CF2-ANA-001)
router.get('/funnel', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.companyId!)
    const { offeringId, botConfigId, dateFrom, dateTo, groupBy } = req.query
    const data = await getFunnelData(companyId, {
      offeringId: offeringId ? String(offeringId) : undefined,
      botConfigId: botConfigId ? String(botConfigId) : undefined,
      dateFrom: dateFrom ? String(dateFrom) : undefined,
      dateTo: dateTo ? String(dateTo) : undefined,
      groupBy: groupBy ? String(groupBy) : undefined
    })
    res.json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to compute funnel' })
  }
})

// GET /api/analytics/trends - Trend reports
router.get('/trends', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { reportType = 'connect_rate', offeringId, dateFrom, dateTo, granularity = 'daily' } = req.query
    const match: Record<string, unknown> = { companyId: new mongoose.Types.ObjectId(companyId) }
    if (offeringId) match.offeringId = String(offeringId)
    if (dateFrom || dateTo) {
      match.timestamp = {}
      if (dateFrom) (match.timestamp as Record<string, Date>).$gte = new Date(String(dateFrom))
      if (dateTo) (match.timestamp as Record<string, Date>).$lte = new Date(String(dateTo))
    }

    const formatKey = granularity === 'daily'
      ? { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
      : granularity === 'weekly'
        ? { $dateToString: { format: '%Y-W%V', date: '$timestamp' } }
        : { $dateToString: { format: '%Y-%m', date: '$timestamp' } }

    if (reportType === 'connect_rate') {
      const [dispByDate, connByDate] = await Promise.all([
        CallEvent.aggregate([
          { $match: { ...match, eventType: 'CALL_DISPATCHED' } },
          { $group: { _id: formatKey, count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]),
        CallEvent.aggregate([
          { $match: { ...match, eventType: 'CALL_CONNECTED' } },
          { $group: { _id: formatKey, count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ])
      ])
      const dispMap = Object.fromEntries(dispByDate.map((d) => [d._id, d.count]))
      const data = connByDate.map((c) => ({
        date: c._id,
        connected: c.count,
        dispatched: dispMap[c._id] ?? 0,
        connectRate: dispMap[c._id] ? Math.round((c.count / dispMap[c._id]) * 1000) / 10 : 0
      }))
      return res.json({ reportType: 'connect_rate', granularity, data })
    }

    if (reportType === 'disposition_breakdown') {
      const [total, byDate] = await Promise.all([
        CallEvent.countDocuments({ ...match, eventType: 'DISPOSITION_SET' }),
        CallEvent.aggregate([
          { $match: { ...match, eventType: 'DISPOSITION_SET' } },
          { $group: { _id: { disposition: '$payload.disposition', date: { $dateToString: { format: granularity === 'daily' ? '%Y-%m-%d' : granularity === 'weekly' ? '%Y-W%V' : '%Y-%m', date: '$timestamp' } } }, count: { $sum: 1 } } },
          { $sort: { '_id.date': 1 } }
        ])
      ])
      const byDisposition: Record<string, number> = {}
      const byDateMap: Record<string, Record<string, number>> = {}
      for (const row of byDate) {
        const disp = row._id.disposition ?? 'unknown'
        const d = row._id.date
        byDisposition[disp] = (byDisposition[disp] ?? 0) + row.count
        if (!byDateMap[d]) byDateMap[d] = {}
        byDateMap[d][disp] = row.count
      }
      return res.json({
        reportType: 'disposition_breakdown',
        granularity,
        total,
        byDisposition,
        byDate: Object.entries(byDateMap).map(([date, dispCounts]) => ({ date, ...dispCounts }))
      })
    }

    if (reportType === 'opt_out_trend') {
      const [optOutByDate, keywordBreakdown] = await Promise.all([
        CallEvent.aggregate([
          { $match: { ...match, eventType: 'OPT_OUT_DETECTED' } },
          { $group: { _id: formatKey, count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]),
        CallEvent.aggregate([
          { $match: { ...match, eventType: 'OPT_OUT_DETECTED', 'payload.keyword': { $exists: true, $ne: null } } },
          { $group: { _id: '$payload.keyword', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 }
        ])
      ])
      return res.json({
        reportType: 'opt_out_trend',
        granularity,
        data: optOutByDate.map((r) => ({ date: r._id, optOutCount: r.count })),
        topKeywords: keywordBreakdown.map((k) => ({ keyword: k._id ?? 'unknown', count: k.count }))
      })
    }

    if (reportType === 'latency') {
      const pipeline = [
        { $match: { ...match, eventType: 'CALL_INITIATED', vapiCallId: { $exists: true, $ne: null } } },
        { $lookup: { from: 'callevents', let: { vc: '$vapiCallId', cid: '$companyId' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$vapiCallId', '$$vc'] }, { $eq: ['$companyId', '$$cid'] }, { $eq: ['$eventType', 'CALL_CONNECTED'] }] } } }, { $project: { timestamp: 1 } }], as: 'conn' } },
        { $unwind: { path: '$conn', preserveNullAndEmptyArrays: false } },
        { $project: { latencySeconds: { $divide: [{ $subtract: ['$conn.timestamp', '$timestamp'] }, 1000] } } },
        { $group: { _id: null, latencies: { $push: '$latencySeconds' } } }
      ]
      const result = await CallEvent.aggregate(pipeline)
      const latencies = result[0]?.latencies ?? []
      latencies.sort((a: number, b: number) => a - b)
      const p = (percentile: number) => {
        if (latencies.length === 0) return 0
        const idx = Math.ceil((percentile / 100) * latencies.length) - 1
        return Math.round((latencies[Math.max(0, idx)] ?? 0) * 10) / 10
      }
      return res.json({
        reportType: 'latency',
        p50: p(50),
        p90: p(90),
        p99: p(99),
        sampleCount: latencies.length
      })
    }

    if (reportType === 'retry_effectiveness') {
      const retries = await CallEvent.find({ ...match, eventType: 'RETRY_SCHEDULED' }).select('accountId contactId').lean()
      let connected = 0
      for (const r of retries) {
        const q: Record<string, unknown> = { ...match, eventType: 'CALL_CONNECTED' }
        if (r.accountId) q.accountId = r.accountId
        else if (r.contactId) q.contactId = r.contactId
        else continue
        const found = await CallEvent.findOne(q)
        if (found) connected++
      }
      const total = retries.length
      return res.json({
        reportType: 'retry_effectiveness',
        totalRetries: total,
        eventuallyConnected: connected,
        connectRate: total > 0 ? Math.round((connected / total) * 1000) / 10 : 0
      })
    }

    res.json({ reportType: String(reportType), data: [] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to compute trends' })
  }
})

// GET /api/analytics/bot-comparison - Side-by-side connect rate and PTP rate per BotConfig (CF2-ANA-002)
router.get('/bot-comparison', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.companyId!)
    const { dateFrom, dateTo } = req.query
    const match: Record<string, unknown> = { companyId, botConfigId: { $exists: true, $ne: null } }
    if (dateFrom || dateTo) {
      match.timestamp = {}
      if (dateFrom) (match.timestamp as Record<string, Date>).$gte = new Date(String(dateFrom))
      if (dateTo) (match.timestamp as Record<string, Date>).$lte = new Date(String(dateTo))
    }

    const [dispatchedByBot, connectedByBot, ptpByBot] = await Promise.all([
      CallEvent.aggregate([
        { $match: { ...match, eventType: 'CALL_DISPATCHED' } },
        { $group: { _id: '$botConfigId', count: { $sum: 1 } } }
      ]),
      CallEvent.aggregate([
        { $match: { ...match, eventType: 'CALL_CONNECTED' } },
        { $group: { _id: '$botConfigId', count: { $sum: 1 } } }
      ]),
      CallEvent.aggregate([
        { $match: { ...match, eventType: 'DISPOSITION_SET', 'payload.disposition': { $in: ['promise_to_pay', 'promise to pay'] } } },
        { $group: { _id: '$botConfigId', count: { $sum: 1 } } }
      ])
    ])

    const { BotConfig } = await import('../models/BotConfig')
    const botConfigs = await BotConfig.find({ companyId, isTemplate: false }).select('_id name offeringId').lean()
    const dispMap = Object.fromEntries(dispatchedByBot.map((d) => [String(d._id), d.count]))
    const connMap = Object.fromEntries(connectedByBot.map((c) => [String(c._id), c.count]))
    const ptpMap = Object.fromEntries(ptpByBot.map((p) => [String(p._id), p.count]))

    const rows = botConfigs.map((b) => {
      const disp = dispMap[b._id.toString()] ?? 0
      const conn = connMap[b._id.toString()] ?? 0
      const ptp = ptpMap[b._id.toString()] ?? 0
      return {
        botConfigId: b._id,
        name: b.name,
        offeringId: b.offeringId,
        dispatched: disp,
        connected: conn,
        connectRate: disp > 0 ? Math.round((conn / disp) * 1000) / 10 : 0,
        ptpCount: ptp,
        ptpRate: conn > 0 ? Math.round((ptp / conn) * 1000) / 10 : 0
      }
    })

    res.json({ bots: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to compute bot comparison' })
  }
})

export default router
