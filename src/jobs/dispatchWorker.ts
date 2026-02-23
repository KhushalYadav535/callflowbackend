import axios from 'axios'
import mongoose from 'mongoose'
import { DispatchQueue } from '../models/DispatchQueue'
import { AccountProfile } from '../models/AccountProfile'
import { BotConfig } from '../models/BotConfig'
import { Company } from '../models/Company'
import { writeCallEvent } from '../services/eventWriter'

const DISPATCH_INTERVAL_MIN = Number(process.env.DISPATCH_WORKER_INTERVAL_MINUTES) || 5
const MAX_DISPATCH_RETRIES = 3
const RATE_LIMIT_PER_MIN = Number(process.env.DISPATCH_RATE_LIMIT_PER_MINUTE) || 60

export async function runDispatchCycle(): Promise<{ dispatched: number; failed: number }> {
  const companies = await mongoose.connection.db
    ?.collection('companies')
    .find({})
    .project({ _id: 1 })
    .toArray()
  if (!companies?.length) return { dispatched: 0, failed: 0 }

  let totalDispatched = 0
  let totalFailed = 0

  for (const c of companies) {
    const companyId = c._id as mongoose.Types.ObjectId
    const company = await Company.findById(companyId)
    const n8nUrl = company?.n8nWebhookUrl
    if (!n8nUrl) continue

    const items = await DispatchQueue.find({ companyId })
      .sort({ nextDispatchAt: 1 })
      .limit(RATE_LIMIT_PER_MIN)
      .populate('accountId')
      .populate('botConfigId')

    for (const item of items) {
      const account = item.accountId as unknown as {
        _id: mongoose.Types.ObjectId
        phone: string
        customerName: string
        outstandingAmount?: number
        dueDate?: Date | null
        productType?: string
        dpd?: number
      } | null
      const bot = item.botConfigId as unknown as { _id: mongoose.Types.ObjectId; offeringId: string; script?: { voice?: string; language?: string; promptTemplate?: string }; dispositions?: { value: string; label: string }[] } | null

      if (!account || !bot) {
        await DispatchQueue.deleteOne({ _id: item._id })
        totalFailed++
        continue
      }

      const payload = {
        accountId: String(account._id),
        companyId: String(companyId),
        name: account.customerName,
        phone: account.phone,
        amount: account.outstandingAmount ?? 0,
        dueDate: account.dueDate,
        productType: account.productType,
        dpd: account.dpd ?? 0,
        botConfigId: String(bot._id),
        offering: bot.offeringId,
        triggerReason: item.triggerReason || 'rule_match',
        voice: bot.script?.voice ?? 'sonia',
        language: bot.script?.language ?? 'hi-IN',
        promptTemplate: bot.script?.promptTemplate,
        dispositionOptions: bot.dispositions?.map((d) => ({ value: d.value, label: d.label })) ?? []
      }

      try {
        await axios.post(n8nUrl, payload, { timeout: 10000 })
        const now = new Date()
        await AccountProfile.updateOne(
          { _id: account._id },
          { $set: { lastCalledAt: now }, $inc: { callCount: 1 } }
        )
        await DispatchQueue.deleteOne({ _id: item._id })
        await writeCallEvent({
          companyId,
          accountId: account._id,
          botConfigId: bot._id,
          offeringId: bot.offeringId,
          eventType: 'CALL_DISPATCHED',
          payload: {
            accountId: String(account._id),
            botConfigId: String(bot._id),
            offering: bot.offeringId,
            dispatchedAt: now,
            triggerReason: item.triggerReason
          },
          source: 'system',
          timestamp: now
        })
        totalDispatched++
      } catch (err) {
        const retryCount = (item.retryCount ?? 0) + 1
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        if (retryCount >= MAX_DISPATCH_RETRIES) {
          await DispatchQueue.deleteOne({ _id: item._id })
          await writeCallEvent({
            companyId,
            accountId: account._id,
            botConfigId: bot._id,
            offeringId: bot.offeringId,
            eventType: 'DISPATCH_FAILED',
            payload: { attemptCount: retryCount, lastError: errMsg },
            source: 'system',
            timestamp: new Date()
          })
          totalFailed++
        } else {
          await DispatchQueue.updateOne(
            { _id: item._id },
            {
              $set: {
                retryCount,
                lastError: errMsg,
                nextDispatchAt: new Date(Date.now() + 5 * 60 * 1000)
              }
            }
          )
        }
      }
    }
  }

  return { dispatched: totalDispatched, failed: totalFailed }
}
