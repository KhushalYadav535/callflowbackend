import mongoose from 'mongoose'
import { AccountProfile } from '../models/AccountProfile'
import { BotConfig } from '../models/BotConfig'
import { DispatchQueue } from '../models/DispatchQueue'
import { DataSourceConfig } from '../models/DataSourceConfig'
import { canDispatch } from './offeringService'
import { ITriggerCondition } from '../models/BotConfig'
import { DndList } from '../models/DndList'
import { normalisePhone } from '../utils/phoneNormalize'
import { writeCallEvent } from './eventWriter'

const STALENESS_THRESHOLD_HOURS = Number(process.env.ACCOUNT_STALENESS_THRESHOLD_HOURS) || 26
const RULE_ENGINE_INTERVAL_MIN = Number(process.env.RULE_ENGINE_INTERVAL_MINUTES) || 15

function evalCondition(account: Record<string, unknown>, cond: ITriggerCondition): boolean {
  const val = account[cond.field]
  const op = cond.operator
  const target = cond.value

  if (op === 'eq') return val === target
  if (op === 'neq') return val !== target

  const numVal = typeof val === 'number' ? val : Number(val)
  const numTarget = typeof target === 'number' ? target : Number(target)
  if (op === 'gt') return !Number.isNaN(numVal) && !Number.isNaN(numTarget) && numVal > numTarget
  if (op === 'gte') return !Number.isNaN(numVal) && !Number.isNaN(numTarget) && numVal >= numTarget
  if (op === 'lt') return !Number.isNaN(numVal) && !Number.isNaN(numTarget) && numVal < numTarget
  if (op === 'lte') return !Number.isNaN(numVal) && !Number.isNaN(numTarget) && numVal <= numTarget

  if (op === 'within_days') {
    const d = val instanceof Date ? val : val ? new Date(String(val)) : null
    if (!d || Number.isNaN(d.getTime())) return false
    const days = typeof target === 'number' ? target : Number(target) || 7
    const now = new Date()
    const diffMs = d.getTime() - now.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    return diffDays >= 0 && diffDays <= days
  }

  if (op === 'past_days') {
    const d = val instanceof Date ? val : val ? new Date(String(val)) : null
    if (!d || Number.isNaN(d.getTime())) return false
    const days = typeof target === 'number' ? target : Number(target) || 7
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    return diffDays >= days
  }

  if (op === 'in') {
    const arr = Array.isArray(target) ? target : [target]
    return arr.includes(val)
  }

  return false
}

function evalTrigger(account: Record<string, unknown>, trigger: { conditions?: ITriggerCondition[]; groups?: { conditions: ITriggerCondition[] }[] }): boolean {
  const conditions = trigger.conditions || []
  const groups = trigger.groups || []
  const conditionsMatch = conditions.length === 0 || conditions.every((c) => evalCondition(account, c))
  const groupsMatch = groups.length === 0 || groups.some((g) => (g.conditions || []).every((c) => evalCondition(account, c)))
  return conditionsMatch && groupsMatch
}

export async function countMatchingAccounts(
  companyId: mongoose.Types.ObjectId,
  botConfigId: mongoose.Types.ObjectId
): Promise<number> {
  const bot = await BotConfig.findOne({ _id: botConfigId, companyId, isTemplate: false })
  if (!bot) return 0
  if (!(await canDispatch(companyId, bot.offeringId))) return 0
  const dsConfig = await DataSourceConfig.findOne({ companyId })
  const stalenessHours = dsConfig?.stalenessThresholdHours ?? STALENESS_THRESHOLD_HOURS
  const cutoff = new Date(Date.now() - stalenessHours * 60 * 60 * 1000)
  const dndPhones = new Set(
    (await DndList.find({ companyId }).select('phoneNormalised')).map((d) => d.phoneNormalised)
  )
  const accounts = await AccountProfile.find({
    companyId,
    status: 'ACTIVE',
    $or: [{ dataFreshnessAt: { $gte: cutoff } }, { dataFreshnessAt: null }]
  })
  const relevantAccounts = accounts.filter((a) => !a.activeBotConfigId || a.activeBotConfigId.equals(bot._id))
  let count = 0
  for (const acc of relevantAccounts) {
    if (dndPhones.has(normalisePhone(acc.phone))) continue
    if (acc.nextCallAt && acc.nextCallAt > new Date()) continue
    const accObj: Record<string, unknown> = {
      ...acc.toObject(),
      dpd: acc.dpd,
      dueDate: acc.dueDate,
      maturityDate: acc.maturityDate,
      kycExpiryDate: acc.kycExpiryDate,
      outstandingAmount: acc.outstandingAmount,
      productType: acc.productType,
      lastCalledAt: acc.lastCalledAt
    }
    if (!evalTrigger(accObj, bot.trigger)) continue
    if (bot.productFilter?.length && (!acc.productType || !bot.productFilter.includes(acc.productType))) continue
    if (bot.amountFilter) {
      const amt = acc.outstandingAmount ?? 0
      if (bot.amountFilter.min != null && amt < bot.amountFilter.min) continue
      if (bot.amountFilter.max != null && amt > bot.amountFilter.max) continue
    }
    count++
  }
  return count
}

function isWithinCallingWindow(companyId: mongoose.Types.ObjectId, start?: string, end?: string): Promise<boolean> {
  return (async () => {
    const { ComplianceConfig } = await import('../models/ComplianceConfig')
    const config = await ComplianceConfig.findOne({ companyId })
    const s = start ?? config?.callingWindowStart ?? '09:00'
    const e = end ?? config?.callingWindowEnd ?? '19:00'
    const now = new Date()
    const [sh, sm] = s.split(':').map(Number)
    const [eh, em] = e.split(':').map(Number)
    const currentMin = now.getHours() * 60 + now.getMinutes()
    const startMin = sh * 60 + sm
    const endMin = eh * 60 + em
    return currentMin >= startMin && currentMin <= endMin
  })()
}

export async function runRuleEngineCycle(): Promise<{ queued: number; skipped: number }> {
  const companies = await mongoose.connection.db
    ?.collection('companies')
    .find({})
    .project({ _id: 1 })
    .toArray()
  if (!companies?.length) return { queued: 0, skipped: 0 }

  let totalQueued = 0
  let totalSkipped = 0

  for (const c of companies) {
    const companyId = c._id as mongoose.Types.ObjectId
    const dsConfig = await DataSourceConfig.findOne({ companyId })
    const stalenessHours = dsConfig?.stalenessThresholdHours ?? STALENESS_THRESHOLD_HOURS
    const cutoff = new Date(Date.now() - stalenessHours * 60 * 60 * 1000)

    const staleCount = await AccountProfile.countDocuments({
      companyId,
      status: { $in: ['ACTIVE', 'PAUSED'] },
      $or: [{ dataFreshnessAt: { $lt: cutoff } }, { dataFreshnessAt: null }]
    })
    if (staleCount > 0) {
      await writeCallEvent({
        companyId,
        eventType: 'ACCOUNT_STALE',
        payload: { staleCount, thresholdHours: stalenessHours },
        source: 'system',
        timestamp: new Date()
      }).catch(() => {})
    }

    const withinWindow = await isWithinCallingWindow(companyId)
    if (!withinWindow) continue

      const botConfigs = await BotConfig.find({
        companyId,
        isTemplate: false,
        isActive: true
      }).sort({ createdAt: 1 })

    const dndPhones = new Set(
      (await DndList.find({ companyId }).select('phoneNormalised')).map((d) => d.phoneNormalised)
    )

      const accounts = await AccountProfile.find({
        companyId,
        status: 'ACTIVE',
        $or: [{ dataFreshnessAt: { $gte: cutoff } }, { dataFreshnessAt: null }]
      })

      for (const bot of botConfigs) {
        if (!(await canDispatch(companyId, bot.offeringId))) continue

        const relevantAccounts = accounts.filter(
          (a) => !a.activeBotConfigId || a.activeBotConfigId.equals(bot._id)
        )

      for (const acc of relevantAccounts) {
        if (dndPhones.has(normalisePhone(acc.phone))) {
          totalSkipped++
          continue
        }
        if (acc.nextCallAt && acc.nextCallAt > new Date()) {
          totalSkipped++
          continue
        }

        const accObj: Record<string, unknown> = { ...acc.toObject() }
        accObj.dpd = acc.dpd
        accObj.dueDate = acc.dueDate
        accObj.maturityDate = acc.maturityDate
        accObj.kycExpiryDate = acc.kycExpiryDate
        accObj.outstandingAmount = acc.outstandingAmount
        accObj.productType = acc.productType
        accObj.lastCalledAt = acc.lastCalledAt

        if (!evalTrigger(accObj, bot.trigger)) {
          totalSkipped++
          continue
        }

        if (bot.productFilter?.length && bot.productFilter.length > 0) {
          if (!acc.productType || !bot.productFilter.includes(acc.productType)) {
            totalSkipped++
            continue
          }
        }

        if (bot.amountFilter) {
          const amt = acc.outstandingAmount ?? 0
          if (bot.amountFilter.min != null && amt < bot.amountFilter.min) {
            totalSkipped++
            continue
          }
          if (bot.amountFilter.max != null && amt > bot.amountFilter.max) {
            totalSkipped++
            continue
          }
        }

        const nextAt = new Date()
        const existing = await DispatchQueue.findOne({ companyId, accountId: acc._id })
        if (existing) {
          totalSkipped++
          continue
        }

        if (!acc.activeBotConfigId || !acc.activeBotConfigId.equals(bot._id)) {
          await AccountProfile.updateOne({ _id: acc._id }, { $set: { activeBotConfigId: bot._id } })
        }

        await DispatchQueue.create({
          companyId,
          accountId: acc._id,
          botConfigId: bot._id,
          offeringId: bot.offeringId,
          triggerReason: 'rule_match',
          nextDispatchAt: nextAt,
          retryCount: 0
        })
        totalQueued++
      }
    }
  }

  return { queued: totalQueued, skipped: totalSkipped }
}
