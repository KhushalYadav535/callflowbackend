"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
exports.requireRoles = requireRoles;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const secret = process.env.JWT_SECRET;
        if (!secret)
            throw new Error('JWT_SECRET not configured');
        const payload = jsonwebtoken_1.default.verify(token, secret);
        req.companyId = payload.companyId;
        req.userId = payload.userId;
        req.role = payload.role || 'TENANT_ADMIN';
        next();
    }
    catch {
        return res.status(401).json({ message: 'Invalid token' });
    }
}
function requireRoles(...allowed) {
    return (req, res, next) => {
        const role = req.role || 'TENANT_ADMIN';
        if (allowed.includes(role))
            return next();
        return res.status(403).json({ message: 'Insufficient permissions' });
    };
}
