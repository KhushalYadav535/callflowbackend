import { Router } from 'express'
import mongoose from 'mongoose'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { CallLog } from '../models/CallLog'
import { Contact } from '../models/Contact'
import { AccountProfile } from '../models/AccountProfile'

const router = Router()

// GET /api/dashboard/stats
router.get('/stats', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const companyObjectId = new mongoose.Types.ObjectId(companyId)

    const [
      totalCallsResult,
      connectedResult,
      promiseToPayResult,
      paidResult,
      accountCount
    ] = await Promise.all([
      CallLog.countDocuments({ companyId: companyObjectId }),
      CallLog.countDocuments({ companyId: companyObjectId, outcome: 'connected' }),
      Contact.countDocuments({ companyId: companyObjectId, paymentDisposition: 'promise_to_pay' }),
      Contact.countDocuments({ companyId: companyObjectId, paymentDisposition: 'paid' }),
      AccountProfile.countDocuments({ companyId: companyObjectId })
    ])

    const totalCallsMade = totalCallsResult
    const callsConnected = connectedResult
    const promiseToPayCount = promiseToPayResult
    const paidCount = paidResult
    const connectRate = totalCallsMade > 0 ? Math.round((callsConnected / totalCallsMade) * 1000) / 10 : 0

    res.json({
      totalCallsMade,
      callsConnected,
      promiseToPayCount,
      paidCount,
      connectRate,
      accountCount
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load dashboard stats' })
  }
})

export default router
