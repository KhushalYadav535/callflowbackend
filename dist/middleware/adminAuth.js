"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformAdminMiddleware = platformAdminMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function platformAdminMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const secret = process.env.PLATFORM_ADMIN_JWT_SECRET || process.env.JWT_SECRET;
        if (!secret)
            throw new Error('JWT secret not configured');
        const payload = jsonwebtoken_1.default.verify(token, secret);
        if (!payload.isPlatformAdmin) {
            return res.status(403).json({ message: 'Platform Admin access required' });
        }
        req.adminId = payload.adminId;
        req.adminEmail = payload.adminEmail;
        next();
    }
    catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}
