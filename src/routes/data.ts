import express, { Router } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { AccountProfile } from '../models/AccountProfile'
import { DataSourceConfig } from '../models/DataSourceConfig'
import { DispatchQueue } from '../models/DispatchQueue'
import { writeCallEvent } from '../services/eventWriter'
import { parseAccountsFromBuffer } from '../utils/parseAccounts'
import { normalisePhone } from '../utils/phoneNormalize'
import mongoose from 'mongoose'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

const allowedMimes = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/plain'
]
const allowedExts = ['.xlsx', '.xls', '.csv']

// POST /api/data/tenant/:companyId/accounts - Push-based CBS sync (CF2-DBL-002, HMAC auth)
router.post('/tenant/:companyId/accounts', async (req, res) => {
  try {
    const { companyId } = req.params
    const companyObjectId = new mongoose.Types.ObjectId(companyId)
    const ds = await DataSourceConfig.findOne({ companyId: companyObjectId })
    if (!ds || ds.mode !== 'push') {
      return res.status(400).json({ message: 'Push sync not configured for this tenant' })
    }
    const secret = ds.pushHmacSecret || process.env.PUSH_HMAC_SECRET_DEFAULT
    if (!secret) {
      return res.status(500).json({ message: 'HMAC secret not configured' })
    }
    const sigHeader = req.headers['x-hmac-signature'] || req.headers['x-signature']
    if (!sigHeader || typeof sigHeader !== 'string') {
      return res.status(401).json({ message: 'Missing HMAC signature' })
    }
    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody
    const bodyForHmac = rawBody ? rawBody.toString('utf8') : JSON.stringify(req.body)
    const expectedSig = crypto.createHmac('sha256', secret).update(bodyForHmac).digest('hex')
    const providedSig = sigHeader.replace(/^sha256=/, '')
    if (!crypto.timingSafeEqual(Buffer.from(expectedSig, 'hex'), Buffer.from(providedSig, 'hex'))) {
      return res.status(401).json({ message: 'Invalid HMAC signature' })
    }
    const payload = Array.isArray(req.body) ? req.body : [req.body]
    if (payload.length > 500) {
      return res.status(400).json({ message: 'Maximum 500 accounts per request' })
    }
    const validEvents = ['account_created', 'account_updated', 'account_closed', 'payment_received']
    let created = 0
    let updated = 0
    let closed = 0
    for (const item of payload) {
      const eventType = item.eventType || 'account_updated'
      if (!validEvents.includes(eventType)) continue
      const externalAccountId = item.externalAccountId
      if (!externalAccountId) continue
      const eventTs = item.timestamp ? new Date(item.timestamp) : new Date()
      const fields = item.fields || item
      const existing = await AccountProfile.findOne({ companyId: companyObjectId, externalAccountId })
      if (eventType === 'account_closed') {
        if (existing) {
          await AccountProfile.updateOne({ _id: existing._id }, { $set: { status: 'COMPLETED', dataFreshnessAt: eventTs } })
          await DispatchQueue.deleteOne({ companyId: companyObjectId, accountId: existing._id })
          closed++
        }
        continue
      }
      const phoneRaw = fields.phone || fields.customerPhone || existing?.phone || ''
      const phone = phoneRaw ? normalisePhone(String(phoneRaw)) : (existing?.phone || '')
      const doc: Record<string, unknown> = {
        companyId: companyObjectId,
        externalAccountId,
        customerName: fields.customerName ?? fields.name ?? existing?.customerName ?? 'Unknown',
        phone,
        dataFreshnessAt: eventTs
      }
      if (fields.dpd !== undefined) doc.dpd = Number(fields.dpd)
      if (fields.outstandingAmount !== undefined) doc.outstandingAmount = Number(fields.outstandingAmount)
      if (fields.dueDate !== undefined) doc.dueDate = fields.dueDate ? new Date(fields.dueDate) : null
      if (fields.maturityDate !== undefined) doc.maturityDate = fields.maturityDate ? new Date(fields.maturityDate) : null
      if (fields.kycExpiryDate !== undefined) doc.kycExpiryDate = fields.kycExpiryDate ? new Date(fields.kycExpiryDate) : null
      if (fields.productType !== undefined) doc.productType = fields.productType
      if (fields.email !== undefined) doc.email = fields.email
      if (fields.altPhone !== undefined) doc.altPhone = fields.altPhone
      if (fields.language !== undefined) doc.language = fields.language
      if (existing) {
        await AccountProfile.updateOne({ _id: existing._id }, { $set: doc })
        updated++
      } else {
        await AccountProfile.create({
          ...doc,
          phone: doc.phone || 'uncallable',
          status: 'ACTIVE',
          callCount: 0
        })
        created++
      }
    }
    await DataSourceConfig.updateOne(
      { companyId: companyObjectId },
      { $set: { lastSyncAt: new Date(), lastSyncStatus: 'success' } }
    )
    res.status(200).json({ ok: true, created, updated, closed })
  } catch (err) {
    console.error('[CF2-DBL] Push sync error:', err)
    res.status(500).json({ message: 'Failed to process push sync' })
  }
})

// POST /api/data/tenant/:companyId/accounts/upload - File-based account sync (CF2-DBL-003)
router.post(
  '/tenant/:companyId/accounts/upload',
  authMiddleware,
  upload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      const companyIdParam = req.params.companyId
      const companyIdFromAuth = req.companyId
      if (!companyIdFromAuth || companyIdFromAuth !== companyIdParam) {
        return res.status(403).json({ message: 'Company ID mismatch' })
      }

      const companyObjectId = new mongoose.Types.ObjectId(companyIdParam)
      if (!req.file) {
        return res.status(400).json({ message: 'file is required' })
      }

      const fname = (req.file.originalname || '').toLowerCase()
      const validMime = allowedMimes.includes(req.file.mimetype)
      const validExt = allowedExts.some((e) => fname.endsWith(e))
      if (!validMime && !validExt) {
        return res.status(400).json({ message: 'Only Excel (.xlsx, .xls) and CSV files are supported' })
      }

      let accounts: Awaited<ReturnType<typeof parseAccountsFromBuffer>>
      try {
        accounts = parseAccountsFromBuffer(req.file.buffer)
      } catch (parseErr: unknown) {
        const msg = parseErr instanceof Error ? parseErr.message : 'Invalid file format'
        return res.status(400).json({ message: msg })
      }

      const now = new Date()
      let created = 0
      let updated = 0
      let skipped = 0

      for (const acc of accounts) {
        const existing = await AccountProfile.findOne({
          companyId: companyObjectId,
          externalAccountId: acc.externalAccountId
        })

        const doc = {
          companyId: companyObjectId,
          externalAccountId: acc.externalAccountId,
          customerName: acc.customerName,
          phone: acc.phone,
          altPhone: acc.altPhone,
          email: acc.email,
          language: acc.language ?? 'hi-IN',
          productType: acc.productType,
          outstandingAmount: acc.outstandingAmount,
          dpd: acc.dpd,
          dueDate: acc.dueDate,
          maturityDate: acc.maturityDate,
          kycExpiryDate: acc.kycExpiryDate,
          dataFreshnessAt: now
        }

        if (existing) {
          await AccountProfile.updateOne(
            { _id: existing._id },
            { $set: doc }
          )
          updated++
        } else {
          await AccountProfile.create({
            ...doc,
            status: 'ACTIVE',
            callCount: 0
          })
          created++
        }
      }

      await DataSourceConfig.findOneAndUpdate(
        { companyId: companyObjectId },
        {
          $set: {
            mode: 'file',
            lastSyncAt: now,
            lastSyncStatus: 'success',
            updatedAt: now
          }
        },
        { upsert: true }
      )

      res.status(200).json({
        ok: true,
        total: accounts.length,
        created,
        updated,
        skipped,
        dataFreshnessAt: now
      })
    } catch (err) {
      console.error('[CF2-DBL] Account upload error:', err)
      res.status(500).json({ message: 'Failed to process account upload' })
    }
  }
)

// POST /api/data/sync/pull/:companyId - Trigger on-demand pull sync (CF2-DBL-001)
router.post('/sync/pull/:companyId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyIdParam = req.params.companyId
    const companyIdFromAuth = req.companyId
    if (!companyIdFromAuth || companyIdFromAuth !== companyIdParam) {
      return res.status(403).json({ message: 'Company ID mismatch' })
    }
    const companyObjectId = new mongoose.Types.ObjectId(companyIdParam)
    const { runPullSync } = await import('../services/pullSyncService')
    const result = await runPullSync(companyObjectId)
    if (!result.ok) {
      return res.status(400).json({ message: result.error })
    }
    res.json(result)
  } catch (err: unknown) {
    const companyObjectId = req.params.companyId ? new mongoose.Types.ObjectId(req.params.companyId) : null
    if (companyObjectId) {
      await DataSourceConfig.updateOne(
        { companyId: companyObjectId },
        { $set: { lastSyncStatus: 'failed' } }
      ).catch(() => {})
      const { writeCallEvent } = await import('../services/eventWriter')
      await writeCallEvent({
        companyId: companyObjectId,
        eventType: 'SYNC_FAILED',
        payload: { mode: 'pull', errorMessage: err instanceof Error ? err.message : 'Unknown error' },
        source: 'system',
        timestamp: new Date()
      }).catch(() => {})
    }
    console.error('[CF2-DBL] Pull sync error:', err)
    const msg = err && typeof err === 'object' && 'response' in err ? (err as { response?: { status?: number } }).response?.status === 401 ? 'CBS auth failed' : 'CBS API error' : 'Failed to trigger pull sync'
    res.status(500).json({ message: msg })
  }
})

export default router
