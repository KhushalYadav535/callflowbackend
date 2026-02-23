import { Router } from 'express'
import mongoose from 'mongoose'
import crypto from 'crypto'
import multer from 'multer'
import XLSX from 'xlsx'
import { authMiddleware, requireRoles, AuthRequest } from '../middleware/auth'
import { Company } from '../models/Company'
import { ComplianceConfig } from '../models/ComplianceConfig'
import { DndList } from '../models/DndList'
import { PlatformOffering } from '../models/PlatformOffering'
import { TenantEntitlement } from '../models/TenantEntitlement'
import { TenantOfferingState } from '../models/TenantOfferingState'
import { DataSourceConfig } from '../models/DataSourceConfig'
import { AccountProfile } from '../models/AccountProfile'
import { normalisePhone } from '../utils/phoneNormalize'
import { encryptPullAuthConfig } from '../services/credentialEncryption'
import { writeCallEvent } from '../services/eventWriter'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

// GET /api/settings (Tenant Admin, Campaign Manager)
router.get('/', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const company = await Company.findById(companyId).select(
      'name email companyType vapiApiKey vapiPhoneNumberId n8nWebhookUrl backendBaseUrl'
    )
    if (!company) {
      return res.status(404).json({ message: 'Company not found' })
    }
    res.json({ settings: company })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load settings' })
  }
})

// PUT /api/settings/backend-url (Tenant Admin, Campaign Manager)
router.put('/backend-url', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { backendBaseUrl } = req.body as { backendBaseUrl?: string }

    if (!backendBaseUrl || typeof backendBaseUrl !== 'string') {
      return res.status(400).json({ message: 'backendBaseUrl is required' })
    }

    const url = backendBaseUrl.replace(/\/$/, '')
    const company = await Company.findByIdAndUpdate(
      companyId,
      { $set: { backendBaseUrl: url } },
      { new: true, select: 'name email companyType n8nWebhookUrl backendBaseUrl' }
    )

    if (!company) {
      return res.status(404).json({ message: 'Company not found' })
    }

    res.json({ settings: company })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to update settings' })
  }
})

// PUT /api/settings/vapi (Tenant Admin, Campaign Manager)
router.put('/vapi', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { vapiApiKey, vapiPhoneNumberId } = req.body as { vapiApiKey?: string; vapiPhoneNumberId?: string }
    const update: Record<string, string | undefined> = {}
    if (vapiApiKey !== undefined) update.vapiApiKey = vapiApiKey || undefined
    if (vapiPhoneNumberId !== undefined) update.vapiPhoneNumberId = vapiPhoneNumberId || undefined
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'At least one of vapiApiKey or vapiPhoneNumberId is required' })
    }
    const company = await Company.findByIdAndUpdate(
      companyId,
      { $set: update },
      { new: true, select: 'name email n8nWebhookUrl vapiApiKey vapiPhoneNumberId' }
    )
    if (!company) return res.status(404).json({ message: 'Company not found' })
    res.json({ settings: company })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to update VAPI settings' })
  }
})

// PUT /api/settings/n8n-webhook (Tenant Admin, Campaign Manager)
router.put('/n8n-webhook', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { n8nWebhookUrl } = req.body as { n8nWebhookUrl?: string }

    if (!n8nWebhookUrl || typeof n8nWebhookUrl !== 'string') {
      return res.status(400).json({ message: 'n8nWebhookUrl is required' })
    }

    const company = await Company.findByIdAndUpdate(
      companyId,
      { $set: { n8nWebhookUrl } },
      { new: true, select: 'name email companyType n8nWebhookUrl backendBaseUrl' }
    )

    if (!company) {
      return res.status(404).json({ message: 'Company not found' })
    }

    res.json({ settings: company })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to update settings' })
  }
})

// GET /api/settings/compliance (Tenant Admin, Campaign Manager)
router.get('/compliance', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const config = await ComplianceConfig.findOne({ companyId: new mongoose.Types.ObjectId(companyId) })
    if (!config) {
      return res.json({
        callingWindowStart: '09:00',
        callingWindowEnd: '19:00',
        timezone: 'Asia/Kolkata',
        optOutKeywords: ['stop calling', "don't call", 'remove me', 'unsubscribe', 'band karo', 'mat karo'],
      })
    }
    res.json(config)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load compliance settings' })
  }
})

// PUT /api/settings/compliance (Tenant Admin, Campaign Manager)
router.put('/compliance', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { callingWindowStart, callingWindowEnd, timezone } = req.body as {
      callingWindowStart?: string
      callingWindowEnd?: string
      timezone?: string
    }
    if (
      !callingWindowStart ||
      !callingWindowEnd ||
      !HHMM_REGEX.test(callingWindowStart) ||
      !HHMM_REGEX.test(callingWindowEnd)
    ) {
      return res.status(400).json({ message: 'Invalid time format. Use HH:MM 24-hour format.' })
    }
    const config = await ComplianceConfig.findOneAndUpdate(
      { companyId },
      {
        $set: {
          callingWindowStart,
          callingWindowEnd,
          timezone: timezone ?? 'Asia/Kolkata'
        }
      },
      { new: true, upsert: true }
    )
    res.json(config)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to update compliance settings' })
  }
})

// PUT /api/settings/opt-out-keywords (Tenant Admin, Campaign Manager)
router.put('/opt-out-keywords', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { keywords } = req.body as { keywords?: string[] }
    if (!Array.isArray(keywords)) {
      return res.status(400).json({ message: 'keywords array is required' })
    }
    const config = await ComplianceConfig.findOneAndUpdate(
      { companyId },
      { $set: { optOutKeywords: keywords.filter((k) => typeof k === 'string') } },
      { new: true, upsert: true }
    )
    res.json(config)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to update opt-out keywords' })
  }
})

// POST /api/settings/dnd-upload (Tenant Admin, Campaign Manager)
router.post(
  '/dnd-upload',
  authMiddleware,
  requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'),
  upload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      const companyId = req.companyId!
      if (!req.file) {
        return res.status(400).json({ message: 'File is required' })
      }
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        return res.status(400).json({ message: 'No sheet found in file' })
      }
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })
      if (!rows.length) {
        return res.status(400).json({ message: 'No rows found in file' })
      }
      const normalize = (key: string) => key.replace(/\s+/g, '').replace(/_/g, '').toLowerCase()
      const headerMap = Object.keys(rows[0]).reduce<Record<string, string>>((acc, key) => {
        acc[normalize(key)] = key
        return acc
      }, {})
      const phoneKey =
        headerMap['phone'] ?? headerMap['phonenumber'] ?? headerMap['mobile'] ?? headerMap['number']
      if (!phoneKey) {
        return res.status(400).json({ message: 'Expected column: phone, mobile, or number' })
      }
      const companyObjectId = new mongoose.Types.ObjectId(companyId)
      const totalBefore = await DndList.countDocuments({ companyId: companyObjectId })
      const seen = new Set<string>()
      for (const row of rows) {
        const raw = String(row[phoneKey] ?? '').trim()
        if (!raw) continue
        const norm = normalisePhone(raw)
        if (!norm || seen.has(norm)) continue
        seen.add(norm)
        await DndList.updateOne(
          { companyId: companyObjectId, phoneNormalised: norm },
          { $setOnInsert: { companyId: companyObjectId, phoneNormalised: norm, phoneRaw: raw } },
          { upsert: true }
        )
      }
      const total = await DndList.countDocuments({ companyId: companyObjectId })
      const added = total - totalBefore
      res.json({ message: 'DND list updated', added, total })
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: 'Failed to upload DND list' })
    }
  }
)

// GET /api/settings/dnd-count (Tenant Admin, Campaign Manager)
router.get('/dnd-count', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const total = await DndList.countDocuments({ companyId: new mongoose.Types.ObjectId(companyId) })
    res.json({ total })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to get DND count' })
  }
})

// GET /api/settings/offerings - List offerings (provisioned + state)
router.get('/offerings', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const companyObjId = new mongoose.Types.ObjectId(companyId)
    const offerings = await PlatformOffering.find({ isAvailable: true }).lean()
    const entitlements = await TenantEntitlement.find({ companyId: companyObjId }).lean()
    const states = await TenantOfferingState.find({ companyId: companyObjId }).lean()
    const entMap = Object.fromEntries(entitlements.map((e) => [e.offeringId, e]))
    const stateMap = Object.fromEntries(states.map((s) => [s.offeringId, s]))
    const result = offerings.map((o) => ({
      ...o,
      isProvisioned: entMap[o.offeringId]?.isProvisioned ?? false,
      isActive: stateMap[o.offeringId]?.isActive ?? false,
      toggledBy: stateMap[o.offeringId]?.toggledBy,
      deactivationReason: stateMap[o.offeringId]?.deactivationReason,
      allowedCapabilities: (entMap[o.offeringId] as { configLimits?: { allowedCapabilities?: string[] } })?.configLimits?.allowedCapabilities ?? (o as { capabilities?: string[] }).capabilities ?? []
    }))
    res.json({ offerings: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load offerings' })
  }
})

// PATCH /api/settings/offerings/:offeringId/state - Toggle tenant offering state
router.patch('/offerings/:offeringId/state', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { offeringId } = req.params
    const { isActive, deactivationReason } = req.body as { isActive?: boolean; deactivationReason?: string }
    const companyObjId = new mongoose.Types.ObjectId(companyId)
    const ent = await TenantEntitlement.findOne({ companyId: companyObjId, offeringId, isProvisioned: true })
    if (!ent) return res.status(403).json({ message: 'Offering not provisioned for this tenant' })

    const { User } = await import('../models/User')
    let toggledBy = 'unknown'
    if (req.userId) {
      const u = await User.findById(req.userId).select('email')
      if (u) toggledBy = u.email
    } else {
      const company = await Company.findById(companyId).select('email')
      toggledBy = company?.email ?? 'unknown'
    }

    const now = new Date()
    await TenantOfferingState.findOneAndUpdate(
      { companyId: companyObjId, offeringId },
      {
        $set: {
          isActive: isActive ?? false,
          [isActive ? 'activatedAt' : 'deactivatedAt']: now,
          toggledBy,
          deactivationReason: !isActive ? deactivationReason : undefined
        }
      },
      { upsert: true, new: true }
    )
    await writeCallEvent({
      companyId: companyObjId,
      eventType: 'OFFERING_TOGGLED',
      offeringId,
      payload: { isActive: isActive ?? false, toggledBy, deactivationReason: !isActive ? deactivationReason : undefined },
      source: 'agent',
      timestamp: now
    })
    res.json({ message: 'Offering state updated', isActive: isActive ?? false })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to update offering state' })
  }
})

// DELETE /api/settings/dnd (Tenant Admin, Campaign Manager)
router.delete('/dnd', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const result = await DndList.deleteMany({ companyId: new mongoose.Types.ObjectId(companyId) })
    res.json({ message: 'DND list cleared', deleted: result.deletedCount })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to clear DND list' })
  }
})

// GET /api/settings/datasource (Tenant Admin, Campaign Manager)
router.get('/datasource', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const companyObjId = new mongoose.Types.ObjectId(companyId)
    let ds = await DataSourceConfig.findOne({ companyId: companyObjId }).lean()
    if (!ds) {
      ds = {
        _id: null,
        companyId: companyObjId,
        mode: 'file',
        stalenessThresholdHours: 26,
        createdAt: new Date(),
        updatedAt: new Date()
      } as unknown as typeof ds
    }
    const stalenessHours = (ds as { stalenessThresholdHours?: number }).stalenessThresholdHours ?? 26
    const cutoff = new Date(Date.now() - stalenessHours * 60 * 60 * 1000)
    const staleCount = await AccountProfile.countDocuments({
      companyId: companyObjId,
      status: { $in: ['ACTIVE', 'PAUSED'] },
      $or: [{ dataFreshnessAt: { $lt: cutoff } }, { dataFreshnessAt: null }]
    })
    const safe: Record<string, unknown> = {
      mode: (ds as { mode?: string }).mode ?? 'file',
      pullUrl: (ds as { pullUrl?: string }).pullUrl ?? null,
      pullAuthType: (ds as { pullAuthType?: string }).pullAuthType ?? null,
      pullAuthConfig: (ds as { pullAuthConfig?: Record<string, string> }).pullAuthConfig
        ? { _masked: true }
        : null,
      pullScheduleCron: (ds as { pullScheduleCron?: string }).pullScheduleCron ?? null,
      fieldMapping: (ds as { fieldMapping?: Record<string, string> }).fieldMapping ?? {},
      stalenessThresholdHours: stalenessHours,
      lastSyncAt: (ds as { lastSyncAt?: Date }).lastSyncAt ?? null,
      lastSyncStatus: (ds as { lastSyncStatus?: string }).lastSyncStatus ?? null,
      pushHmacSecretSet: !!(ds as { pushHmacSecret?: string }).pushHmacSecret,
      staleAccountCount: staleCount
    }
    res.json(safe)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load datasource config' })
  }
})

// PUT /api/settings/datasource (Tenant Admin, Campaign Manager)
router.put('/datasource', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const companyObjId = new mongoose.Types.ObjectId(companyId)
    const body = req.body as {
      mode?: 'pull' | 'push' | 'file'
      pullUrl?: string
      pullAuthType?: 'api_key' | 'oauth2' | 'basic'
      pullAuthConfig?: Record<string, string>
      pullScheduleCron?: string
      fieldMapping?: Record<string, string>
      stalenessThresholdHours?: number
      pushHmacSecret?: string
    }
    const update: Record<string, unknown> = {}
    if (body.mode !== undefined) update.mode = body.mode
    if (body.pullUrl !== undefined) update.pullUrl = body.pullUrl || null
    if (body.pullAuthType !== undefined) update.pullAuthType = body.pullAuthType || null
    if (body.pullAuthConfig !== undefined) {
      const raw = body.pullAuthConfig
      update.pullAuthConfig = raw && Object.keys(raw).length > 0 ? encryptPullAuthConfig(raw) : null
    }
    if (body.pullScheduleCron !== undefined) update.pullScheduleCron = body.pullScheduleCron || null
    if (body.fieldMapping !== undefined) update.fieldMapping = body.fieldMapping || {}
    if (body.stalenessThresholdHours !== undefined) update.stalenessThresholdHours = Math.max(1, Math.min(168, body.stalenessThresholdHours))
    if (body.pushHmacSecret !== undefined && body.pushHmacSecret.trim()) update.pushHmacSecret = body.pushHmacSecret.trim()
    const ds = await DataSourceConfig.findOneAndUpdate(
      { companyId: companyObjId },
      { $set: update },
      { new: true, upsert: true }
    )
    res.json({ mode: ds?.mode, lastSyncAt: ds?.lastSyncAt, lastSyncStatus: ds?.lastSyncStatus })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to update datasource config' })
  }
})

// POST /api/settings/datasource/regenerate-hmac (Tenant Admin, Campaign Manager)
router.post('/datasource/regenerate-hmac', authMiddleware, requireRoles('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const companyObjId = new mongoose.Types.ObjectId(companyId)
    const secret = crypto.randomBytes(32).toString('hex')
    await DataSourceConfig.findOneAndUpdate(
      { companyId: companyObjId },
      { $set: { pushHmacSecret: secret } },
      { new: true, upsert: true }
    )
    res.json({ pushHmacSecret: secret })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to regenerate HMAC secret' })
  }
})

export default router

