"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ADMIN_PASSWORD = exports.DEFAULT_ADMIN_EMAIL = void 0;
exports.createAdminToken = createAdminToken;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const PlatformAdmin_1 = require("../models/PlatformAdmin");
const adminAuth_1 = require("../middleware/adminAuth");
const router = (0, express_1.Router)();
const DEFAULT_ADMIN_EMAIL = 'sdsite@sentientdigital.in';
exports.DEFAULT_ADMIN_EMAIL = DEFAULT_ADMIN_EMAIL;
const DEFAULT_ADMIN_PASSWORD = 'Sentient1234@';
exports.DEFAULT_ADMIN_PASSWORD = DEFAULT_ADMIN_PASSWORD;
function createAdminToken(adminId, adminEmail) {
    const secret = process.env.PLATFORM_ADMIN_JWT_SECRET || process.env.JWT_SECRET;
    if (!secret)
        throw new Error('JWT secret not configured');
    const expiresIn = process.env.PLATFORM_ADMIN_JWT_EXPIRES_IN || '8h';
    return jsonwebtoken_1.default.sign({ adminId, adminEmail, isPlatformAdmin: true }, secret, { expiresIn });
}
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }
    const emailNorm = String(email).trim().toLowerCase();
    try {
        const admin = await PlatformAdmin_1.PlatformAdmin.findOne({ email: emailNorm });
        if (!admin || !admin.isActive) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const match = await bcryptjs_1.default.compare(password, admin.password);
        if (!match)
            return res.status(401).json({ message: 'Invalid credentials' });
        const token = createAdminToken(admin._id.toString(), admin.email);
        res.json({
            token,
            admin: {
                id: admin._id,
                email: admin.email,
                name: admin.name
            },
            isPlatformAdmin: true
        });
    }
    catch (err) {
        console.error('[AdminAuth] Login error:', err);
        res.status(500).json({ message: 'Login failed' });
    }
});
router.get('/me', adminAuth_1.platformAdminMiddleware, async (req, res) => {
    try {
        const adminId = req.adminId;
        if (!adminId)
            return res.status(401).json({ message: 'Unauthorized' });
        const admin = await PlatformAdmin_1.PlatformAdmin.findById(adminId).select('-password');
        if (!admin || !admin.isActive) {
            return res.status(401).json({ message: 'Admin not found or inactive' });
        }
        res.json({ admin, isPlatformAdmin: true });
    }
    catch {
        return res.status(401).json({ message: 'Invalid token' });
    }
});
exports.default = router;
