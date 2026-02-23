import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AdminAuthRequest extends Request {
  adminId?: string
  adminEmail?: string
}

export function platformAdminMiddleware(req: AdminAuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const token = authHeader.split(' ')[1]
  try {
    const secret = process.env.PLATFORM_ADMIN_JWT_SECRET || process.env.JWT_SECRET
    if (!secret) throw new Error('JWT secret not configured')

    const payload = jwt.verify(token, secret) as {
      adminId: string
      adminEmail?: string
      isPlatformAdmin: boolean
    }

    if (!payload.isPlatformAdmin) {
      return res.status(403).json({ message: 'Platform Admin access required' })
    }

    req.adminId = payload.adminId
    req.adminEmail = payload.adminEmail
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}
