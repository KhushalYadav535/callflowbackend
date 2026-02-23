import { Router } from 'express'
import mongoose, { PipelineStage } from 'mongoose'
import { authMiddleware, requireRoles, AuthRequest } from '../middleware/auth'
import { CallEvent } from '../models/CallEvent'
import { AccountProfile } from '../models/AccountProfile'
import { getFunnelData } from '../services/funnelService'

const router = Router()

// GET /api/events/funnel - BRD-specified funnel alias (CF2-EVT-002)
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

// GET /api/events/account/:accountId - Full event timeline for one account
router.get('/account/:accountId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { accountId } = req.params
    const account = await AccountProfile.findOne({ _id: accountId, companyId })
    if (!account) return res.status(404).json({ message: 'Account not found' })

    const { limit = '100', eventType } = req.query
    const limitNum = Math.min(parseInt(String(limit), 10) || 100, 200)
    const query: Record<string, unknown> = { companyId: new mongoose.Types.ObjectId(companyId), accountId: new mongoose.Types.ObjectId(accountId) }
    if (eventType) query.eventType = String(eventType)

    const events = await CallEvent.find(query)
      .sort({ timestamp: -1 })
      .limit(limitNum)
      .lean()

    res.json({ events })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load events' })
  }
})

// GET /api/events/summary - Aggregated event counts for analytics (CF2-EVT-002)
router.get('/summary', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { offeringId, botConfigId, dateFrom, dateTo, groupBy } = req.query
    const match: Record<string, unknown> = { companyId: new mongoose.Types.ObjectId(companyId) }
    if (offeringId) match.offeringId = String(offeringId)
    if (botConfigId) match.botConfigId = new mongoose.Types.ObjectId(String(botConfigId))
    if (dateFrom || dateTo) {
      match.timestamp = {}
      if (dateFrom) (match.timestamp as Record<string, Date>).$gte = new Date(String(dateFrom))
      if (dateTo) (match.timestamp as Record<string, Date>).$lte = new Date(String(dateTo))
    }
    const eventCounts = await CallEvent.aggregate([
      { $match: match },
      { $group: { _id: '$eventType', count: { $sum: 1 } } }
    ])
    const summary: Record<string, number> = {}
    for (const r of eventCounts) summary[r._id] = r.count
    const groupByVal = groupBy === 'productType' || groupBy === 'language' ? String(groupBy) : null
    let byGroup: { groupValue: string; counts: Record<string, number> }[] = []
    if (groupByVal) {
      const pipe: PipelineStage[] = [
        { $match: match },
        { $lookup: { from: 'accountprofiles', localField: 'accountId', foreignField: '_id', as: 'acc', pipeline: [{ $project: { productType: 1, language: 1 } }] } },
        { $lookup: { from: 'contacts', localField: 'contactId', foreignField: '_id', as: 'con', pipeline: [{ $project: { loanType: 1 } }] } },
        { $addFields: { groupVal: groupByVal === 'productType' ? { $ifNull: [{ $arrayElemAt: ['$acc.productType', 0] }, { $arrayElemAt: ['$con.loanType', 0] }] } : { $ifNull: [{ $arrayElemAt: ['$acc.language', 0] }, 'unknown'] } } },
        { $group: { _id: { group: { $ifNull: ['$groupVal', 'unknown'] }, eventType: '$eventType' }, count: { $sum: 1 } } }
      ]
      const grouped = await CallEvent.aggregate(pipe)
      const map: Record<string, Record<string, number>> = {}
      for (const g of grouped) {
        const gv = g._id?.group ?? 'unknown'
        if (!map[gv]) map[gv] = {}
        map[gv][g._id.eventType] = g.count
      }
      byGroup = Object.entries(map).map(([groupValue, counts]) => ({ groupValue, counts }))
    }
    res.json({ summary, byGroup })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load event summary' })
  }
})

// GET /api/events/call/:vapiCallId - Events for one call session
router.get('/call/:vapiCallId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { vapiCallId } = req.params
    const events = await CallEvent.find({ companyId, vapiCallId })
      .sort({ timestamp: 1 })
      .lean()
    res.json({ events })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load events' })
  }
})

// PUT /api/events/:eventId - Rejected: events are append-only (CF2-EVT-001)
router.put('/:eventId', authMiddleware, async (_req, res) => {
  res.status(403).json({ message: 'CallEvent documents are append-only; updates are not permitted' })
})

// DELETE /api/events/:eventId - Rejected: events are append-only (CF2-EVT-001)
router.delete('/:eventId', authMiddleware, async (_req, res) => {
  res.status(403).json({ message: 'CallEvent documents are append-only; deletes are not permitted' })
})

export default router
