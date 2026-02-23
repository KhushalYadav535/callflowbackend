import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PlatformAdmin } from '../models/PlatformAdmin'
import { platformAdminMiddleware, AdminAuthRequest } from '../middleware/adminAuth'

const router = Router()

const DEFAULT_ADMIN_EMAIL = 'sdsite@sentientdigital.in'
const DEFAULT_ADMIN_PASSWORD = 'Sentient1234@'

function createAdminToken(adminId: string, adminEmail: string): string {
  const secret = process.env.PLATFORM_ADMIN_JWT_SECRET || process.env.JWT_SECRET
  if (!secret) throw new Error('JWT secret not configured')
  const expiresIn = process.env.PLATFORM_ADMIN_JWT_EXPIRES_IN || '8h'
  return jwt.sign(
    { adminId, adminEmail, isPlatformAdmin: true },
    secret as jwt.Secret,
    { expiresIn } as jwt.SignOptions
  )
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' })
  }

  const emailNorm = String(email).trim().toLowerCase()
  try {
    const admin = await PlatformAdmin.findOne({ email: emailNorm })
    if (!admin || !admin.isActive) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const match = await bcrypt.compare(password, admin.password)
    if (!match) return res.status(401).json({ message: 'Invalid credentials' })

    const token = createAdminToken(admin._id.toString(), admin.email)
    res.json({
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        name: admin.name
      },
      isPlatformAdmin: true
    })
  } catch (err) {
    console.error('[AdminAuth] Login error:', err)
    res.status(500).json({ message: 'Login failed' })
  }
})

router.get('/me', platformAdminMiddleware, async (req, res) => {
  try {
    const adminId = (req as AdminAuthRequest).adminId
    if (!adminId) return res.status(401).json({ message: 'Unauthorized' })
    const admin = await PlatformAdmin.findById(adminId).select('-password')
    if (!admin || !admin.isActive) {
      return res.status(401).json({ message: 'Admin not found or inactive' })
    }
    res.json({ admin, isPlatformAdmin: true })
  } catch {
    return res.status(401).json({ message: 'Invalid token' })
  }
})

export default router
export { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, createAdminToken }
