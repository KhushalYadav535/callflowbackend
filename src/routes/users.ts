import { Router } from 'express'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { authMiddleware, requireRoles, AuthRequest, UserRole } from '../middleware/auth'
import { User } from '../models/User'

const router = Router()

// GET /api/users - List users for the company (Tenant Admin only)
router.get('/', authMiddleware, requireRoles('TENANT_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const users = await User.find({ companyId })
      .select('-password')
      .sort({ createdAt: -1 })
      .lean()
    res.json({ users })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load users' })
  }
})

// POST /api/users - Create user (Tenant Admin only)
router.post('/', authMiddleware, requireRoles('TENANT_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const userId = req.userId
    const { email, password, name, role } = req.body as {
      email?: string
      password?: string
      name?: string
      role?: UserRole
    }

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' })
    }

    const validRoles: UserRole[] = ['CAMPAIGN_MANAGER', 'RECOVERY_AGENT']
    const userRole = role && validRoles.includes(role) ? role : 'RECOVERY_AGENT'

    const emailNorm = String(email).trim().toLowerCase()
    const existing = await User.findOne({ companyId: new mongoose.Types.ObjectId(companyId), email: emailNorm })
    if (existing) {
      return res.status(409).json({ message: 'User with this email already exists in your organization' })
    }

    const hashed = await bcrypt.hash(password, 10)
    const user = await User.create({
      companyId: new mongoose.Types.ObjectId(companyId),
      email: emailNorm,
      password: hashed,
      name: name || emailNorm.split('@')[0],
      role: userRole,
      createdBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
    })

    res.status(201).json({
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to create user' })
  }
})

export default router
