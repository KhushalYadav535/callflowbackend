import { Router } from 'express'
import { authMiddleware, requireRoles, AuthRequest } from '../middleware/auth'
import { Contact } from '../models/Contact'
import { CallLog } from '../models/CallLog'
import { ManualUpdate } from '../models/ManualUpdate'
import { ReassignLog } from '../models/ReassignLog'
import { Campaign } from '../models/Campaign'
import { Company } from '../models/Company'
import mongoose from 'mongoose'
import { writeCallEvent } from '../services/eventWriter'

const router = Router()

const DISPOSITION_VALUES = ['paid', 'promise_to_pay', 'not_reachable', 'dispute'] as const

function isValidDisposition(v: string): v is (typeof DISPOSITION_VALUES)[number] {
  return DISPOSITION_VALUES.includes(v as any)
}

// GET /api/contacts/:contactId/history (must be before :campaignId routes)
router.get('/:contactId/history', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { contactId } = req.params
    const contact = await Contact.findOne({ _id: contactId, companyId })
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' })
    }
    const [callLogs, manualUpdates, reassignLogs] = await Promise.all([
      CallLog.find({ contactId: contact._id, companyId }).sort({ createdAt: -1 }),
      ManualUpdate.find({ contactId: contact._id, companyId }).sort({ createdAt: -1 }),
      ReassignLog.find({ contactId: contact._id, companyId })
        .sort({ createdAt: -1 })
        .populate('targetCampaignId', 'name')
    ])
    res.json({
      contact: {
        _id: contact._id,
        name: contact.name,
        phone: contact.phone,
        amount: contact.amount,
        dueDate: contact.dueDate,
        callStatus: contact.callStatus,
        paymentDisposition: contact.paymentDisposition
      },
      callLogs: callLogs.map((log) => ({
        _id: log._id,
        attemptNumber: log.attemptNumber,
        createdAt: log.createdAt,
        calledAt: log.createdAt,
        outcome: log.outcome,
        disposition: log.disposition,
        promiseToPayDate: log.promiseToPayDate,
        duration: log.duration,
        transcript: log.transcript,
        recordingUrl: log.recordingUrl,
        optOutDetected: log.optOutDetected
      })),
      manualUpdates: manualUpdates.map((mu) => ({
        _id: mu._id,
        updatedBy: mu.updatedBy,
        timestamp: mu.createdAt,
        createdAt: mu.createdAt,
        oldDisposition: mu.oldDisposition,
        newDisposition: mu.newDisposition,
        note: mu.note
      })),
      reassignLogs: reassignLogs.map((rl) => {
        const tc = rl.targetCampaignId as { _id?: mongoose.Types.ObjectId; name?: string } | undefined
        const id = tc && typeof tc === 'object' && tc._id ? String(tc._id) : String(rl.targetCampaignId)
        return {
          _id: rl._id,
          updatedBy: rl.updatedBy,
          timestamp: rl.createdAt,
          createdAt: rl.createdAt,
          targetCampaignId: id,
          targetCampaignName: tc?.name ?? null,
          newContactId: rl.newContactId
        }
      })
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load contact history' })
  }
})

// PATCH /api/contacts/:contactId/disposition (Tenant Admin, Campaign Manager, Recovery Agent)
router.patch('/:contactId/disposition', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER', 'RECOVERY_AGENT'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { User } = await import('../models/User')
    let userEmail = 'unknown'
    if (req.userId) {
      const u = await User.findById(req.userId).select('email')
      if (u) userEmail = u.email
    } else {
      const company = await Company.findById(companyId).select('email')
      userEmail = company?.email ?? 'unknown'
    }
    const { contactId } = req.params
    const { disposition, promiseToPayDate, note } = req.body as {
      disposition?: string
      promiseToPayDate?: string
      note?: string
    }
    if (!disposition || !isValidDisposition(disposition)) {
      return res.status(400).json({ message: 'Invalid disposition value' })
    }
    if (disposition === 'promise_to_pay' && (!promiseToPayDate || typeof promiseToPayDate !== 'string')) {
      return res.status(400).json({ message: 'promiseToPayDate is required for promise_to_pay disposition' })
    }
    const contact = await Contact.findOne({ _id: contactId, companyId })
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' })
    }
    const oldDisposition = contact.paymentDisposition || null
    const update: Record<string, any> = {
      paymentDisposition: disposition
    }
    if (disposition === 'paid') {
      update.callStatus = 'PAID'
    }
    if (disposition === 'dispute') {
      update.isDisputed = true
    }
    if (disposition === 'promise_to_pay' && promiseToPayDate) {
      const d = new Date(promiseToPayDate)
      if (!isNaN(d.getTime())) {
        update.promiseToPayDate = d
        if (d < new Date()) {
          console.warn(`[CF-PAY] promiseToPayDate ${promiseToPayDate} is in the past for contact ${contact._id}`)
        }
      }
    }
    await Contact.updateOne({ _id: contact._id }, { $set: update })
    await ManualUpdate.create({
      contactId: contact._id,
      campaignId: contact.campaignId,
      companyId: contact.companyId,
      updatedBy: userEmail,
      oldDisposition,
      newDisposition: disposition,
      promiseToPayDate: disposition === 'promise_to_pay' && promiseToPayDate ? new Date(promiseToPayDate) : null,
      note
    })
    const updated = await Contact.findById(contact._id)
    res.json(updated)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to update disposition' })
  }
})

// PATCH /api/contacts/:contactId/withdraw (Tenant Admin, Recovery Agent)
router.patch('/:contactId/withdraw', authMiddleware, requireRoles('TENANT_ADMIN', 'RECOVERY_AGENT'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { contactId } = req.params
    const contact = await Contact.findOne({ _id: contactId, companyId })
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' })
    }
    if (contact.callStatus === 'WITHDRAWN') {
      return res.json({ message: 'Contact withdrawn', contactId: contact._id, status: 'WITHDRAWN' })
    }
    await Contact.updateOne({ _id: contact._id }, { $set: { callStatus: 'WITHDRAWN' } })
    const { User } = await import('../models/User')
    let agentEmail = 'unknown'
    if (req.userId) {
      const u = await User.findById(req.userId).select('email')
      if (u) agentEmail = u.email
    }
    await writeCallEvent({
      companyId: new mongoose.Types.ObjectId(companyId),
      contactId: contact._id,
      campaignId: contact.campaignId,
      eventType: 'MANUAL_OVERRIDE',
      payload: { action: 'withdraw', performedBy: agentEmail },
      source: 'agent',
      timestamp: new Date()
    })
    res.json({ message: 'Contact withdrawn', contactId: contact._id, status: 'WITHDRAWN' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to withdraw contact' })
  }
})

// POST /api/contacts/:contactId/reassign (Tenant Admin, Recovery Agent)
router.post('/:contactId/reassign', authMiddleware, requireRoles('TENANT_ADMIN', 'RECOVERY_AGENT'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { contactId } = req.params
    const { targetCampaignId } = req.body as { targetCampaignId?: string }
    if (!targetCampaignId) {
      return res.status(400).json({ message: 'targetCampaignId is required' })
    }
    const contact = await Contact.findOne({ _id: contactId, companyId })
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' })
    }
    const targetCampaign = await Campaign.findOne({ _id: targetCampaignId, companyId })
    if (!targetCampaign) {
      return res.status(404).json({ message: 'Target campaign not found' })
    }
    if (targetCampaign.status === 'COMPLETED' || targetCampaign.status === 'DRAFT') {
      return res.status(400).json({ message: 'Cannot reassign to a completed or draft campaign' })
    }
    if (targetCampaign._id.equals(contact.campaignId)) {
      return res.status(400).json({ message: 'Contact is already in this campaign' })
    }
    const { User } = await import('../models/User')
    let userEmail = 'unknown'
    if (req.userId) {
      const u = await User.findById(req.userId).select('email')
      if (u) userEmail = u.email
    } else {
      const company = await Company.findById(companyId).select('email')
      userEmail = company?.email ?? 'unknown'
    }
    await Contact.updateOne({ _id: contact._id }, { $set: { callStatus: 'REASSIGNED' } })
    const newContact = await Contact.create({
      campaignId: targetCampaign._id,
      companyId: contact.companyId,
      name: contact.name,
      phone: contact.phone,
      amount: contact.amount,
      dueDate: contact.dueDate,
      loanType: contact.loanType,
      email: contact.email,
      city: contact.city,
      callStatus: 'PENDING',
      retryCount: 0
    })
    await Campaign.updateOne(
      { _id: targetCampaign._id },
      { $inc: { totalContacts: 1 } }
    )
    await ReassignLog.create({
      contactId: contact._id,
      campaignId: contact.campaignId,
      companyId: contact.companyId,
      targetCampaignId: targetCampaign._id,
      newContactId: newContact._id,
      updatedBy: userEmail
    })
    await writeCallEvent({
      companyId: contact.companyId,
      contactId: contact._id,
      campaignId: contact.campaignId,
      eventType: 'MANUAL_OVERRIDE',
      payload: { action: 'reassign', targetCampaignId: targetCampaign._id.toString(), performedBy: userEmail },
      source: 'agent',
      timestamp: new Date()
    })
    res.json({
      message: 'Contact reassigned',
      newContactId: newContact._id,
      targetCampaignId: targetCampaign._id
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to reassign contact' })
  }
})

// GET /api/contacts/:campaignId
router.get('/:campaignId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { campaignId } = req.params
    const { status, page = '1', limit = '100' } = req.query

    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1)
    const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 100, 1), 200)

    const query: any = {
      companyId: new mongoose.Types.ObjectId(companyId),
      campaignId: new mongoose.Types.ObjectId(campaignId)
    }

    if (status && typeof status === 'string' && status !== 'ALL') {
      query.callStatus = status
    }

    const [contacts, total, stats] = await Promise.all([
      Contact.find(query)
        .sort({ createdAt: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      Contact.countDocuments(query),
      Contact.aggregate([
        { $match: query },
        { $group: { _id: '$callStatus', count: { $sum: 1 } } }
      ])
    ])

    const statusCounts: Record<string, number> = {}
    for (const s of stats) {
      statusCounts[s._id] = s.count
    }

    res.json({
      contacts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total
      },
      stats: statusCounts
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load contacts' })
  }
})

// GET /api/contacts/:campaignId/stats
router.get('/:campaignId/stats', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { campaignId } = req.params

    const matchQuery = {
      companyId: new mongoose.Types.ObjectId(companyId),
      campaignId: new mongoose.Types.ObjectId(campaignId)
    }

    const stats = await Contact.aggregate([
      { $match: matchQuery },
      { $group: { _id: '$callStatus', count: { $sum: 1 } } }
    ])

    const statusCounts: Record<string, number> = {}
    for (const s of stats) {
      statusCounts[s._id] = s.count
    }

    res.json({ stats: statusCounts })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load contact stats' })
  }
})

export default router

