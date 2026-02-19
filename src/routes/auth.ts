import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Company } from '../models/Company'
import { AuthRequest } from '../middleware/auth'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.post('/register', async (req, res) => {
  const { name, email, password, companyType } = req.body
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email and password are required' })
  }

  try {
    const existing = await Company.findOne({ email })
    if (existing) {
      return res.status(409).json({ message: 'Company with this email already exists' })
    }

    const hashed = await bcrypt.hash(password, 10)
    const company = await Company.create({ name, email, password: hashed, companyType })

    const token = createToken(company._id.toString())
    res.status(201).json({
      token,
      company: {
        id: company._id,
        name: company.name,
        email: company.email,
        companyType: company.companyType
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to register company' })
  }
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' })
  }

  try {
    const company = await Company.findOne({ email })
    if (!company) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const match = await bcrypt.compare(password, company.password)
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const token = createToken(company._id.toString())
    res.json({
      token,
      company: {
        id: company._id,
        name: company.name,
        email: company.email,
        companyType: company.companyType
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to login' })
  }
})

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = req.companyId!
    const company = await Company.findById(companyId).select('-password')
    if (!company) {
      return res.status(404).json({ message: 'Company not found' })
    }
    res.json({ company })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load profile' })
  }
})

function createToken(companyId: string) {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET not configured')
  }
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d'
  return jwt.sign({ companyId }, secret as jwt.Secret, {
    expiresIn
  } as jwt.SignOptions)
}

export default router

