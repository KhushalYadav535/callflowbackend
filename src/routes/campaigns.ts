import { Router } from 'express'
import multer from 'multer'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { Campaign } from '../models/Campaign'
import { Contact } from '../models/Contact'
import { parseContactsFromBuffer } from '../utils/parseContacts'
import { Company } from '../models/Company'
import mongoose from 'mongoose'
import axios from 'axios'

const router = Router()

const upload = multer({ storage: multer.memoryStorage() })

// POST /api/campaigns/create
router.post(
  '/create',
  authMiddleware,
  upload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      const companyId = req.companyId!
      const { name, type, voice, language, maxRetries, retryAfterHours } = req.body

      if (!name || !type || !voice || !language) {
        return res
          .status(400)
          .json({ message: 'name, type, voice and language are required' })
      }

      if (!req.file) {
        return res.status(400).json({ message: 'file is required' })
      }

      const contactsData = parseContactsFromBuffer(req.file.buffer)

      if (!contactsData.length) {
        return res.status(400).json({ message: 'No contacts found in file' })
      }

      const campaign = await Campaign.create({
        companyId: new mongoose.Types.ObjectId(companyId),
        name,
        type,
        voice,
        language,
        maxRetries: maxRetries ? Number(maxRetries) : undefined,
        retryAfterHours: retryAfterHours ? Number(retryAfterHours) : undefined,
        totalContacts: contactsData.length
      })

      const contactsToInsert = contactsData.map((c) => ({
        campaignId: campaign._id,
        companyId: campaign.companyId,
        name: c.name,
        phone: c.phone,
        amount: c.amount,
        dueDate: c.dueDate,
        loanType: c.loanType,
        email: c.email,
        city: c.city,
        callStatus: 'PENDING' as const
      }))

      await Contact.insertMany(contactsToInsert)

      const previewContacts = await Contact.find({
        campaignId: campaign._id
      })
        .sort({ createdAt: 1 })
        .limit(50)

      res.status(201).json({
        campaign,
        contacts: previewContacts,
        totalCount: contactsData.length
      })
    } catch (err: any) {
      console.error(err)
      return res.status(500).json({
        message: err?.message || 'Failed to create campaign from file'
      })
    }
  }
)

// GET /api/campaigns
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const campaigns = await Campaign.find({ companyId }).sort({ createdAt: -1 })
    res.json({ campaigns })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load campaigns' })
  }
})

// GET /api/campaigns/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { id } = req.params

    const campaign = await Campaign.findOne({ _id: id, companyId })
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' })
    }

    const stats = await Contact.aggregate([
      { $match: { campaignId: campaign._id } },
      {
        $group: {
          _id: '$callStatus',
          count: { $sum: 1 }
        }
      }
    ])

    const statusCounts: Record<string, number> = {}
    for (const s of stats) {
      statusCounts[s._id] = s.count
    }

    res.json({ campaign, stats: statusCounts })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load campaign' })
  }
})

// PATCH /api/campaigns/:id/launch
router.patch('/:id/launch', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { id } = req.params

    const campaign = await Campaign.findOne({ _id: id, companyId })
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' })
    }

    const company = await Company.findById(companyId).select('n8nWebhookUrl')
    const n8nUrl = company?.n8nWebhookUrl || process.env.N8N_WEBHOOK_URL
    if (!n8nUrl) {
      return res
        .status(500)
        .json({ message: 'n8n webhook URL is not configured for this company' })
    }

    const pendingContacts = await Contact.find({
      campaignId: campaign._id,
      companyId,
      callStatus: 'PENDING'
    })

    if (!pendingContacts.length) {
      return res.status(400).json({ message: 'No PENDING contacts to launch' })
    }

    // Mark as ACTIVE
    campaign.status = 'ACTIVE'
    await campaign.save()

    // Fire-and-forget: enqueue contacts to n8n
    const payloads = pendingContacts.map((contact) => ({
      contactId: contact._id,
      campaignId: campaign._id,
      companyId,
      name: contact.name,
      phone: contact.phone,
      amount: contact.amount,
      dueDate: contact.dueDate,
      loanType: contact.loanType,
      email: contact.email,
      city: contact.city,
      maxRetries: campaign.maxRetries,
      retryAfterHours: campaign.retryAfterHours,
      campaignType: campaign.type,
      voice: campaign.voice,
      language: campaign.language
    }))

    // Simple parallel dispatch
    void Promise.all(
      payloads.map((body) =>
        axios
          .post(n8nUrl, body)
          .catch((err) => console.error('Failed to notify n8n for contact', body.contactId, err))
      )
    )

    res.json({ message: 'Campaign launched', queued: pendingContacts.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to launch campaign' })
  }
})

// PATCH /api/campaigns/:id/pause
router.patch('/:id/pause', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { id } = req.params
    const campaign = await Campaign.findOneAndUpdate(
      { _id: id, companyId },
      { $set: { status: 'PAUSED' } },
      { new: true }
    )
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' })
    }
    res.json({ campaign })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to pause campaign' })
  }
})

// DELETE /api/campaigns/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { id } = req.params

    const campaign = await Campaign.findOneAndDelete({ _id: id, companyId })
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' })
    }

    await Contact.deleteMany({ campaignId: campaign._id, companyId })

    res.json({ message: 'Campaign and contacts deleted' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to delete campaign' })
  }
})

export default router

