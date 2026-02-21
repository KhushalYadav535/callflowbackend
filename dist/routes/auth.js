"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const Company_1 = require("../models/Company");
const User_1 = require("../models/User");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.post('/register', async (req, res) => {
    const { name, email, password, companyType } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'name, email and password are required' });
    }
    const emailNorm = String(email).trim().toLowerCase();
    try {
        const existingCompany = await Company_1.Company.findOne({ email: emailNorm });
        const existingUser = await User_1.User.findOne({ email: emailNorm });
        if (existingCompany || existingUser) {
            return res.status(409).json({ message: 'Email already registered' });
        }
        const hashed = await bcryptjs_1.default.hash(password, 10);
        const company = await Company_1.Company.create({
            name,
            email: emailNorm,
            password: hashed,
            companyType
        });
        await User_1.User.create({
            companyId: company._id,
            email: emailNorm,
            password: hashed,
            name,
            role: 'TENANT_ADMIN'
        });
        const token = createToken(company._id.toString(), undefined, 'TENANT_ADMIN');
        res.status(201).json({
            token,
            company: {
                id: company._id,
                name: company.name,
                email: company.email,
                companyType: company.companyType
            },
            user: { role: 'TENANT_ADMIN' }
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to register company' });
    }
});
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'email and password are required' });
    }
    const emailNorm = String(email).trim().toLowerCase();
    try {
        let user = await User_1.User.findOne({ email: emailNorm }).populate('companyId', 'name _id');
        if (user) {
            const match = await bcryptjs_1.default.compare(password, user.password);
            if (!match)
                return res.status(401).json({ message: 'Invalid credentials' });
            const company = user.companyId;
            const companyId = String(company._id);
            const token = createToken(companyId, user._id.toString(), user.role);
            return res.json({
                token,
                company: { id: company._id, name: company.name, email: user.email },
                user: { role: user.role, userId: user._id }
            });
        }
        const company = await Company_1.Company.findOne({ email: emailNorm });
        if (company) {
            const match = await bcryptjs_1.default.compare(password, company.password);
            if (!match)
                return res.status(401).json({ message: 'Invalid credentials' });
            const token = createToken(company._id.toString(), undefined, 'TENANT_ADMIN');
            return res.json({
                token,
                company: { id: company._id, name: company.name, email: company.email },
                user: { role: 'TENANT_ADMIN' }
            });
        }
        return res.status(401).json({ message: 'Invalid credentials' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to login' });
    }
});
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: 'Email is required' });
    }
    try {
        const company = await Company_1.Company.findOne({ email: email.trim().toLowerCase() });
        if (company) {
            // In production: generate reset token, store in DB, send email
            // For now: return success without sending (avoids email enumeration)
            // TODO: Integrate email provider (SendGrid, SES, etc.)
        }
        res.json({ message: 'If that email exists, we have sent a password reset link.' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to process request' });
    }
});
router.get('/me', auth_1.authMiddleware, async (req, res) => {
    try {
        const companyId = req.companyId;
        const userId = req.userId;
        const role = req.role || 'TENANT_ADMIN';
        const company = await Company_1.Company.findById(companyId).select('-password');
        if (!company)
            return res.status(404).json({ message: 'Company not found' });
        let user = null;
        if (userId) {
            user = await User_1.User.findById(userId).select('email name role').lean();
        }
        res.json({ company, user: user || { email: company.email, role }, role });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load profile' });
    }
});
router.get('/companies', auth_1.authMiddleware, async (req, res) => {
    try {
        const companyId = req.companyId;
        const company = await Company_1.Company.findById(companyId).select('name _id');
        if (!company)
            return res.status(404).json({ message: 'Company not found' });
        res.json({ companies: [{ _id: company._id, name: company.name }] });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load companies' });
    }
});
function createToken(companyId, userId, role) {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error('JWT_SECRET not configured');
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const payload = { companyId, role: role || 'TENANT_ADMIN' };
    if (userId)
        payload.userId = userId;
    return jsonwebtoken_1.default.sign(payload, secret, { expiresIn });
}
exports.default = router;
