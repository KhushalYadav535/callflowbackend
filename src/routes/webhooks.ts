import { Router } from 'express'
import mongoose from 'mongoose'
import { Contact } from '../models/Contact'
import { Campaign } from '../models/Campaign'
import { CallLog } from '../models/CallLog'

const router = Router()

// Shared webhook handler - validates companyId if provided in URL
async function handleN8nWebhook(req: any, res: any, expectedCompanyId?: string) {
  try {
    const {
      contactId,
      campaignId,
      vapiCallId,
      outcome,
      duration,
      transcript,
      recordingUrl
    } = req.body || {}

    if (!contactId || !campaignId || !vapiCallId || !outcome) {
      return res.status(400).json({ message: 'Missing required fields in webhook payload' })
    }

    const contactObjectId = new mongoose.Types.ObjectId(contactId)
    const campaignObjectId = new mongoose.Types.ObjectId(campaignId)

    const [contact, campaign] = await Promise.all([
      Contact.findById(contactObjectId),
      Campaign.findById(campaignObjectId)
    ])

    if (!contact || !campaign) {
      return res.status(404).json({ message: 'Contact or Campaign not found' })
    }

    const companyId = campaign.companyId

    if (expectedCompanyId && companyId.toString() !== expectedCompanyId) {
      return res.status(403).json({ message: 'Company ID mismatch' })
    }

    let newStatus = contact.callStatus
    const now = new Date()
    let nextRetryAt: Date | null = contact.nextRetryAt || null
    let retryCount = contact.retryCount || 0

    if (outcome === 'connected') {
      newStatus = 'CONNECTED'
    } else if (outcome === 'not_answered' || outcome === 'voicemail' || outcome === 'failed') {
      retryCount += 1
      const maxRetries = campaign.maxRetries ?? 3
      const retryAfterHours = campaign.retryAfterHours ?? 8

      if (retryCount < maxRetries) {
        newStatus = 'NOT_ANSWERED'
        nextRetryAt = new Date(now.getTime() + retryAfterHours * 60 * 60 * 1000)
      } else {
        newStatus = 'MAX_RETRY_DONE'
        nextRetryAt = null
      }
    }

    await Contact.updateOne(
      { _id: contact._id },
      {
        $set: {
          callStatus: newStatus,
          lastCalledAt: now,
          nextRetryAt,
          connectedAt: newStatus === 'CONNECTED' ? now : contact.connectedAt
        },
        $setOnInsert: {
          companyId
        },
        $inc: { retryCount: outcome === 'connected' ? 0 : 1 }
      }
    )

    const attemptNumber = (contact.retryCount || 0) + 1

    await CallLog.create({
      contactId: contact._id,
      campaignId: campaign._id,
      companyId,
      vapiCallId,
      attemptNumber,
      duration: duration ?? 0,
      outcome,
      transcript,
      recordingUrl
    })

    return res.json({ ok: true })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Failed to process n8n webhook' })
  }
}

// POST /api/webhooks/tenant/:companyId/phone - tenant-specific (for n8n, copy-paste URL)
router.post('/tenant/:companyId/phone', async (req, res) => {
  return handleN8nWebhook(req, res, req.params.companyId)
})

// POST /api/webhooks/n8n - legacy, no tenant in path
router.post('/n8n', async (req, res) => {
  return handleN8nWebhook(req, res)
})

export default router

