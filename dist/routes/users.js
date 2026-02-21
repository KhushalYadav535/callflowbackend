"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const mongoose_1 = __importDefault(require("mongoose"));
const auth_1 = require("../middleware/auth");
const User_1 = require("../models/User");
const router = (0, express_1.Router)();
// GET /api/users - List users for the company (Tenant Admin only)
router.get('/', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const users = await User_1.User.find({ companyId })
            .select('-password')
            .sort({ createdAt: -1 })
            .lean();
        res.json({ users });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load users' });
    }
});
// POST /api/users - Create user (Tenant Admin only)
router.post('/', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const userId = req.userId;
        const { email, password, name, role } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'email and password are required' });
        }
        const validRoles = ['CAMPAIGN_MANAGER', 'RECOVERY_AGENT'];
        const userRole = role && validRoles.includes(role) ? role : 'RECOVERY_AGENT';
        const emailNorm = String(email).trim().toLowerCase();
        const existing = await User_1.User.findOne({ companyId: new mongoose_1.default.Types.ObjectId(companyId), email: emailNorm });
        if (existing) {
            return res.status(409).json({ message: 'User with this email already exists in your organization' });
        }
        const hashed = await bcryptjs_1.default.hash(password, 10);
        const user = await User_1.User.create({
            companyId: new mongoose_1.default.Types.ObjectId(companyId),
            email: emailNorm,
            password: hashed,
            name: name || emailNorm.split('@')[0],
            role: userRole,
            createdBy: userId ? new mongoose_1.default.Types.ObjectId(userId) : undefined,
        });
        res.status(201).json({
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                createdAt: user.createdAt,
            },
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to create user' });
    }
});
exports.default = router;
