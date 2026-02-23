import { Router } from 'express'
import { authMiddleware, requireRoles, AuthRequest } from '../middleware/auth'
import { AccountProfile } from '../models/AccountProfile'
import { BotConfig } from '../models/BotConfig'
import { writeCallEvent } from '../services/eventWriter'
import { DispatchQueue } from '../models/DispatchQueue'
import mongoose from 'mongoose'

const router = Router()

// GET /api/accounts - List AccountProfiles for company
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { page = '1', limit = '50', status, offeringId, botConfigId, productType, dpdMin, dpdMax, lastCalledFrom, lastCalledTo } = req.query
    const pageNum = Math.max(parseInt(String(page), 10) || 1, 1)
    const limitNum = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 200)
    const companyObjId = new mongoose.Types.ObjectId(companyId)

    const query: Record<string, unknown> = { companyId: companyObjId }
    if (status && String(status) !== 'ALL') query.status = String(status)
    if (productType) query.productType = String(productType)
    if (botConfigId) query.activeBotConfigId = new mongoose.Types.ObjectId(String(botConfigId))
    if (offeringId) {
      const botIds = await BotConfig.find({ companyId: companyObjId, offeringId: String(offeringId) }).select('_id').lean()
      query.activeBotConfigId = { $in: botIds.map((b) => b._id) }
    }
    if (dpdMin !== undefined || dpdMax !== undefined) {
      query.dpd = {}
      if (dpdMin !== undefined) (query.dpd as Record<string, number>).$gte = parseInt(String(dpdMin), 10) || 0
      if (dpdMax !== undefined) (query.dpd as Record<string, number>).$lte = parseInt(String(dpdMax), 10) ?? 999
    }
    if (lastCalledFrom || lastCalledTo) {
      query.lastCalledAt = {}
      if (lastCalledFrom) (query.lastCalledAt as Record<string, Date>).$gte = new Date(String(lastCalledFrom))
      if (lastCalledTo) (query.lastCalledAt as Record<string, Date>).$lte = new Date(String(lastCalledTo))
    }

    const { DataSourceConfig } = await import('../models/DataSourceConfig')
    const dsConfig = await DataSourceConfig.findOne({ companyId: companyObjId })
    const stalenessHours = dsConfig?.stalenessThresholdHours ?? 26
    const cutoff = new Date(Date.now() - stalenessHours * 60 * 60 * 1000)

    const [accounts, total, statusStats, staleCount] = await Promise.all([
      AccountProfile.find(query)
        .populate('activeBotConfigId', 'name offeringId')
        .sort({ updatedAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      AccountProfile.countDocuments(query),
      AccountProfile.aggregate([
        { $match: { companyId: companyObjId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      AccountProfile.countDocuments({
        companyId: companyObjId,
        status: { $in: ['ACTIVE', 'PAUSED'] },
        $or: [{ dataFreshnessAt: { $lt: cutoff } }, { dataFreshnessAt: null }]
      })
    ])
    const statusCounts: Record<string, number> = {}
    for (const s of statusStats) statusCounts[s._id] = s.count
    statusCounts.STALE = staleCount

    res.json({
      accounts,
      pagination: { page: pageNum, limit: limitNum, total },
      stats: statusCounts
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load accounts' })
  }
})

// GET /api/accounts/:accountId - Get single AccountProfile
router.get('/:accountId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { accountId } = req.params
    const account = await AccountProfile.findOne({
      _id: accountId,
      companyId
    })
      .populate('activeBotConfigId')
      .lean()
    if (!account) return res.status(404).json({ message: 'Account not found' })
    res.json(account)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load account' })
  }
})

// PATCH /api/accounts/:accountId/pause - Pause account (remove from queue)
router.patch('/:accountId/pause', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER', 'RECOVERY_AGENT'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { accountId } = req.params
    const account = await AccountProfile.findOne({ _id: accountId, companyId })
    if (!account) return res.status(404).json({ message: 'Account not found' })
    await AccountProfile.updateOne({ _id: accountId }, { $set: { status: 'PAUSED' } })
    res.json({ message: 'Account paused', status: 'PAUSED' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to pause account' })
  }
})

// PATCH /api/accounts/:accountId/exclude - Exclude account permanently
router.patch('/:accountId/exclude', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER', 'RECOVERY_AGENT'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { accountId } = req.params
    const account = await AccountProfile.findOne({ _id: accountId, companyId })
    if (!account) return res.status(404).json({ message: 'Account not found' })
    await AccountProfile.updateOne({ _id: accountId }, { $set: { status: 'EXCLUDED' } })
    res.json({ message: 'Account excluded', status: 'EXCLUDED' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to exclude account' })
  }
})

// PATCH /api/accounts/:accountId/disposition - Manual disposition update (CF2-OVR)
router.patch('/:accountId/disposition', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER', 'RECOVERY_AGENT'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { accountId } = req.params
    const { disposition, promiseToPayDate, note } = req.body as { disposition?: string; promiseToPayDate?: string; note?: string }
    if (!disposition || typeof disposition !== 'string' || !disposition.trim()) {
      return res.status(400).json({ message: 'disposition is required' })
    }
    const account = await AccountProfile.findOne({ _id: accountId, companyId }).populate('activeBotConfigId')
    if (!account) return res.status(404).json({ message: 'Account not found' })
    const bot = account.activeBotConfigId as { _id: mongoose.Types.ObjectId; offeringId?: string } | null
    await writeCallEvent({
      companyId: new mongoose.Types.ObjectId(companyId),
      accountId: new mongoose.Types.ObjectId(accountId),
      botConfigId: bot?._id,
      offeringId: bot?.offeringId,
      eventType: 'DISPOSITION_SET',
      payload: {
        disposition: disposition.trim(),
        setBy: 'agent',
        promiseToPayDate: promiseToPayDate ? new Date(promiseToPayDate) : undefined,
        note: note || undefined
      },
      source: 'agent',
      timestamp: new Date()
    })
    if (['paid', 'set_account_completed', 'close_cycle', 'acknowledged', 'payment_scheduled'].includes(disposition.toLowerCase())) {
      await AccountProfile.updateOne({ _id: accountId }, { $set: { status: 'COMPLETED' } })
      await DispatchQueue.deleteOne({ accountId: new mongoose.Types.ObjectId(accountId) })
    }
    res.json({ message: 'Disposition updated', disposition: disposition.trim() })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to update disposition' })
  }
})

// PATCH /api/accounts/:accountId/assign - Assign BotConfig to account
router.patch('/:accountId/assign', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { accountId } = req.params
    const { activeBotConfigId } = req.body as { activeBotConfigId?: string }
    if (!activeBotConfigId) return res.status(400).json({ message: 'activeBotConfigId is required' })
    const { BotConfig } = await import('../models/BotConfig')
    const bot = await BotConfig.findOne({ _id: activeBotConfigId, companyId })
    if (!bot) return res.status(404).json({ message: 'BotConfig not found' })
    const account = await AccountProfile.findOne({ _id: accountId, companyId })
    if (!account) return res.status(404).json({ message: 'Account not found' })
    await AccountProfile.updateOne({ _id: accountId }, { $set: { activeBotConfigId: bot._id, status: 'ACTIVE' } })
    res.json({ message: 'Bot assigned', activeBotConfigId: bot._id })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to assign bot' })
  }
})

// GET /api/accounts/:accountId/notes - List notes for account
router.get('/:accountId/notes', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { accountId } = req.params
    const account = await AccountProfile.findOne({ _id: accountId, companyId })
    if (!account) return res.status(404).json({ message: 'Account not found' })
    const { AccountNote } = await import('../models/AccountNote')
    const notes = await AccountNote.find({ accountId, companyId: new mongoose.Types.ObjectId(companyId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
    res.json({ notes })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load notes' })
  }
})

// POST /api/accounts/:accountId/notes - Add note to account (CF2-ACCT manual action)
router.post('/:accountId/notes', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER', 'RECOVERY_AGENT'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { accountId } = req.params
    const { note } = req.body as { note?: string }
    if (!note || typeof note !== 'string' || !note.trim()) return res.status(400).json({ message: 'note is required' })
    const account = await AccountProfile.findOne({ _id: accountId, companyId })
    if (!account) return res.status(404).json({ message: 'Account not found' })
    const { AccountNote } = await import('../models/AccountNote')
    const { User } = await import('../models/User')
    let createdBy = 'unknown'
    if (req.userId) {
      const u = await User.findById(req.userId).select('email')
      if (u) createdBy = u.email
    }
    const n = await AccountNote.create({
      accountId: new mongoose.Types.ObjectId(accountId),
      companyId: new mongoose.Types.ObjectId(companyId),
      note: note.trim(),
      createdBy
    })
    await writeCallEvent({
      companyId: new mongoose.Types.ObjectId(companyId),
      accountId: new mongoose.Types.ObjectId(accountId),
      eventType: 'MANUAL_OVERRIDE',
      payload: { action: 'add_note', note: note.trim(), createdBy },
      source: 'agent',
      timestamp: new Date()
    })
    res.status(201).json(n)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to add note' })
  }
})

export default router
