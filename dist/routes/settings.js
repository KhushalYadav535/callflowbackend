"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const multer_1 = __importDefault(require("multer"));
const xlsx_1 = __importDefault(require("xlsx"));
const auth_1 = require("../middleware/auth");
const Company_1 = require("../models/Company");
const ComplianceConfig_1 = require("../models/ComplianceConfig");
const DndList_1 = require("../models/DndList");
const phoneNormalize_1 = require("../utils/phoneNormalize");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
// GET /api/settings (Tenant Admin, Campaign Manager)
router.get('/', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const company = await Company_1.Company.findById(companyId).select('name email companyType vapiApiKey vapiPhoneNumberId n8nWebhookUrl backendBaseUrl');
        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }
        res.json({ settings: company });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load settings' });
    }
});
// PUT /api/settings/backend-url (Tenant Admin, Campaign Manager)
router.put('/backend-url', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { backendBaseUrl } = req.body;
        if (!backendBaseUrl || typeof backendBaseUrl !== 'string') {
            return res.status(400).json({ message: 'backendBaseUrl is required' });
        }
        const url = backendBaseUrl.replace(/\/$/, '');
        const company = await Company_1.Company.findByIdAndUpdate(companyId, { $set: { backendBaseUrl: url } }, { new: true, select: 'name email companyType n8nWebhookUrl backendBaseUrl' });
        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }
        res.json({ settings: company });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update settings' });
    }
});
// PUT /api/settings/vapi (Tenant Admin, Campaign Manager)
router.put('/vapi', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { vapiApiKey, vapiPhoneNumberId } = req.body;
        const update = {};
        if (vapiApiKey !== undefined)
            update.vapiApiKey = vapiApiKey || undefined;
        if (vapiPhoneNumberId !== undefined)
            update.vapiPhoneNumberId = vapiPhoneNumberId || undefined;
        if (Object.keys(update).length === 0) {
            return res.status(400).json({ message: 'At least one of vapiApiKey or vapiPhoneNumberId is required' });
        }
        const company = await Company_1.Company.findByIdAndUpdate(companyId, { $set: update }, { new: true, select: 'name email n8nWebhookUrl vapiApiKey vapiPhoneNumberId' });
        if (!company)
            return res.status(404).json({ message: 'Company not found' });
        res.json({ settings: company });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update VAPI settings' });
    }
});
// PUT /api/settings/n8n-webhook (Tenant Admin, Campaign Manager)
router.put('/n8n-webhook', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { n8nWebhookUrl } = req.body;
        if (!n8nWebhookUrl || typeof n8nWebhookUrl !== 'string') {
            return res.status(400).json({ message: 'n8nWebhookUrl is required' });
        }
        const company = await Company_1.Company.findByIdAndUpdate(companyId, { $set: { n8nWebhookUrl } }, { new: true, select: 'name email companyType n8nWebhookUrl backendBaseUrl' });
        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }
        res.json({ settings: company });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update settings' });
    }
});
// GET /api/settings/compliance (Tenant Admin, Campaign Manager)
router.get('/compliance', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const config = await ComplianceConfig_1.ComplianceConfig.findOne({ companyId: new mongoose_1.default.Types.ObjectId(companyId) });
        if (!config) {
            return res.json({
                callingWindowStart: '09:00',
                callingWindowEnd: '19:00',
                timezone: 'Asia/Kolkata',
                optOutKeywords: ['stop calling', "don't call", 'remove me', 'unsubscribe', 'band karo', 'mat karo'],
            });
        }
        res.json(config);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load compliance settings' });
    }
});
// PUT /api/settings/compliance (Tenant Admin, Campaign Manager)
router.put('/compliance', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { callingWindowStart, callingWindowEnd, timezone } = req.body;
        if (!callingWindowStart ||
            !callingWindowEnd ||
            !HHMM_REGEX.test(callingWindowStart) ||
            !HHMM_REGEX.test(callingWindowEnd)) {
            return res.status(400).json({ message: 'Invalid time format. Use HH:MM 24-hour format.' });
        }
        const config = await ComplianceConfig_1.ComplianceConfig.findOneAndUpdate({ companyId }, {
            $set: {
                callingWindowStart,
                callingWindowEnd,
                timezone: timezone ?? 'Asia/Kolkata'
            }
        }, { new: true, upsert: true });
        res.json(config);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update compliance settings' });
    }
});
// PUT /api/settings/opt-out-keywords (Tenant Admin, Campaign Manager)
router.put('/opt-out-keywords', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { keywords } = req.body;
        if (!Array.isArray(keywords)) {
            return res.status(400).json({ message: 'keywords array is required' });
        }
        const config = await ComplianceConfig_1.ComplianceConfig.findOneAndUpdate({ companyId }, { $set: { optOutKeywords: keywords.filter((k) => typeof k === 'string') } }, { new: true, upsert: true });
        res.json(config);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update opt-out keywords' });
    }
});
// POST /api/settings/dnd-upload (Tenant Admin, Campaign Manager)
router.post('/dnd-upload', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), upload.single('file'), async (req, res) => {
    try {
        const companyId = req.companyId;
        if (!req.file) {
            return res.status(400).json({ message: 'File is required' });
        }
        const workbook = xlsx_1.default.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            return res.status(400).json({ message: 'No sheet found in file' });
        }
        const rows = xlsx_1.default.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        if (!rows.length) {
            return res.status(400).json({ message: 'No rows found in file' });
        }
        const normalize = (key) => key.replace(/\s+/g, '').replace(/_/g, '').toLowerCase();
        const headerMap = Object.keys(rows[0]).reduce((acc, key) => {
            acc[normalize(key)] = key;
            return acc;
        }, {});
        const phoneKey = headerMap['phone'] ?? headerMap['phonenumber'] ?? headerMap['mobile'] ?? headerMap['number'];
        if (!phoneKey) {
            return res.status(400).json({ message: 'Expected column: phone, mobile, or number' });
        }
        const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
        const totalBefore = await DndList_1.DndList.countDocuments({ companyId: companyObjectId });
        const seen = new Set();
        for (const row of rows) {
            const raw = String(row[phoneKey] ?? '').trim();
            if (!raw)
                continue;
            const norm = (0, phoneNormalize_1.normalisePhone)(raw);
            if (!norm || seen.has(norm))
                continue;
            seen.add(norm);
            await DndList_1.DndList.updateOne({ companyId: companyObjectId, phoneNormalised: norm }, { $setOnInsert: { companyId: companyObjectId, phoneNormalised: norm, phoneRaw: raw } }, { upsert: true });
        }
        const total = await DndList_1.DndList.countDocuments({ companyId: companyObjectId });
        const added = total - totalBefore;
        res.json({ message: 'DND list updated', added, total });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to upload DND list' });
    }
});
// GET /api/settings/dnd-count (Tenant Admin, Campaign Manager)
router.get('/dnd-count', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const total = await DndList_1.DndList.countDocuments({ companyId: new mongoose_1.default.Types.ObjectId(companyId) });
        res.json({ total });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to get DND count' });
    }
});
// DELETE /api/settings/dnd (Tenant Admin, Campaign Manager)
router.delete('/dnd', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const result = await DndList_1.DndList.deleteMany({ companyId: new mongoose_1.default.Types.ObjectId(companyId) });
        res.json({ message: 'DND list cleared', deleted: result.deletedCount });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to clear DND list' });
    }
});
exports.default = router;
