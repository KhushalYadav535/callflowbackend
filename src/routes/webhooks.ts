import { Router } from 'express'
import mongoose from 'mongoose'
import { Contact } from '../models/Contact'
import { Campaign } from '../models/Campaign'
import { CallLog } from '../models/CallLog'
import { ComplianceConfig } from '../models/ComplianceConfig'

const router = Router()

const DISPOSITION_VALUES = ['paid', 'promise_to_pay', 'not_reachable', 'dispute'] as const
const OUTCOME_VALUES = ['connected', 'not_answered', 'voicemail', 'failed'] as const

function isValidOutcome(v: string): v is (typeof OUTCOME_VALUES)[number] {
  return OUTCOME_VALUES.includes(v as any)
}
function isValidDisposition(v: string): v is (typeof DISPOSITION_VALUES)[number] {
  return DISPOSITION_VALUES.includes(v as any)
}

async function getOptOutKeywords(companyId: mongoose.Types.ObjectId): Promise<string[]> {
  const config = await ComplianceConfig.findOne({ companyId })
  return config?.optOutKeywords ?? ['stop calling', "don't call", 'remove me', 'unsubscribe', 'band karo', 'mat karo']
}

function checkOptOut(transcript: string | null | undefined, keywords: string[]): boolean {
  if (!transcript || !keywords.length) return false
  const lower = transcript.toLowerCase()
  return keywords.some((kw) => lower.includes(kw.toLowerCase()))
}

async function handleN8nWebhook(req: any, res: any, expectedCompanyId?: string) {
  try {
    const body = req.body || {}
    const {
      contactId,
      campaignId,
      vapiCallId,
      outcome,
      duration,
      transcript,
      recordingUrl,
      disposition,
      promiseToPayDate
    } = body

    if (!contactId || !campaignId || !vapiCallId || !outcome) {
      return res.status(400).json({ message: 'Missing required fields in webhook payload' })
    }
    if (!isValidOutcome(outcome)) {
      return res.status(400).json({ message: 'Invalid outcome value' })
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

    const keywords = await getOptOutKeywords(companyId)
    if (checkOptOut(transcript, keywords)) {
      await Contact.updateOne({ _id: contact._id }, { $set: { callStatus: 'OPT_OUT' } })
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
        recordingUrl,
        disposition: disposition || null,
        optOutDetected: true,
        rawPayload: body
      })
      return res.json({ ok: true, contactStatus: 'OPT_OUT', optOutDetected: true })
    }

    if (disposition && isValidDisposition(disposition)) {
      if (disposition === 'paid') {
        await Contact.updateOne(
          { _id: contact._id },
          { $set: { callStatus: 'PAID', paymentDisposition: 'paid' } }
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
          recordingUrl,
          disposition,
          rawPayload: body
        })
        return res.json({ ok: true, contactStatus: 'PAID', disposition: 'paid' })
      }
    }

    if (contact.callStatus === 'PAID' || contact.callStatus === 'OPT_OUT') {
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
        recordingUrl,
        disposition: disposition || null,
        promiseToPayDate: disposition === 'promise_to_pay' && promiseToPayDate ? new Date(promiseToPayDate) : null,
        rawPayload: body
      })
      return res.json({ ok: true, contactStatus: contact.callStatus })
    }

    const now = new Date()
    let newStatus = contact.callStatus
    let nextRetryAt: Date | null = contact.nextRetryAt || null
    let retryCount = contact.retryCount || 0

    const updateData: Record<string, any> = {
      lastCalledAt: now,
      connectedAt: newStatus === 'CONNECTED' ? now : contact.connectedAt
    }

    if (disposition && isValidDisposition(disposition)) {
      updateData.paymentDisposition = disposition
      if (disposition === 'dispute') updateData.isDisputed = true
      if (disposition === 'promise_to_pay' && promiseToPayDate) {
        const d = new Date(promiseToPayDate)
        if (!isNaN(d.getTime())) {
          updateData.promiseToPayDate = d
          if (d < now) {
            console.warn(`[CF-PAY] promiseToPayDate ${promiseToPayDate} is in the past for contact ${contact._id}`)
          }
        }
      }
    }

    if (outcome === 'connected') {
      newStatus = 'CONNECTED'
      updateData.connectedAt = now
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
    updateData.callStatus = newStatus
    updateData.nextRetryAt = nextRetryAt

    await Contact.updateOne(
      { _id: contact._id },
      { $set: updateData, $inc: { retryCount: outcome === 'connected' ? 0 : 1 } }
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
      recordingUrl,
      disposition: disposition || null,
      promiseToPayDate: disposition === 'promise_to_pay' && promiseToPayDate ? new Date(promiseToPayDate) : null,
      rawPayload: body
    })

    return res.json({ ok: true, contactStatus: newStatus })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Failed to process n8n webhook' })
  }
}

router.post('/tenant/:companyId/phone', async (req, res) => {
  return handleN8nWebhook(req, res, req.params.companyId)
})
router.post('/n8n', async (req, res) => {
  return handleN8nWebhook(req, res)
})

export default router
