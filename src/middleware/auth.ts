import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export type UserRole = 'TENANT_ADMIN' | 'CAMPAIGN_MANAGER' | 'RECOVERY_AGENT'

export interface AuthRequest extends Request {
  companyId?: string
  userId?: string
  role?: UserRole
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const token = authHeader.split(' ')[1]
  try {
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET not configured')

    const payload = jwt.verify(token, secret) as {
      companyId: string
      userId?: string
      role?: UserRole
    }
    req.companyId = payload.companyId
    req.userId = payload.userId
    req.role = payload.role || 'TENANT_ADMIN'
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid token' })
  }
}

export function requireRoles(...allowed: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.role || 'TENANT_ADMIN'
    if (allowed.includes(role)) return next()
    return res.status(403).json({ message: 'Insufficient permissions' })
  }
}

