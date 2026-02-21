import { Router } from 'express'
import mongoose from 'mongoose'
import multer from 'multer'
import XLSX from 'xlsx'
import { authMiddleware, requireRoles, AuthRequest } from '../middleware/auth'
import { Company } from '../models/Company'
import { ComplianceConfig } from '../models/ComplianceConfig'
import { DndList } from '../models/DndList'
import { normalisePhone } from '../utils/phoneNormalize'

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

export default router

