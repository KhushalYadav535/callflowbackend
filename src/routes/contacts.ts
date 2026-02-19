import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { Contact } from '../models/Contact'
import mongoose from 'mongoose'

const router = Router()

// GET /api/contacts/:campaignId
router.get('/:campaignId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const { campaignId } = req.params
    const { status, page = '1', limit = '50' } = req.query

    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1)
    const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 200)

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

