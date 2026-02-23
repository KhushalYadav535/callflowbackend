"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
const multer_1 = __importDefault(require("multer"));
const xlsx_1 = __importDefault(require("xlsx"));
const auth_1 = require("../middleware/auth");
const Company_1 = require("../models/Company");
const ComplianceConfig_1 = require("../models/ComplianceConfig");
const DndList_1 = require("../models/DndList");
const PlatformOffering_1 = require("../models/PlatformOffering");
const TenantEntitlement_1 = require("../models/TenantEntitlement");
const TenantOfferingState_1 = require("../models/TenantOfferingState");
const DataSourceConfig_1 = require("../models/DataSourceConfig");
const AccountProfile_1 = require("../models/AccountProfile");
const phoneNormalize_1 = require("../utils/phoneNormalize");
const credentialEncryption_1 = require("../services/credentialEncryption");
const eventWriter_1 = require("../services/eventWriter");
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
// GET /api/settings/offerings - List offerings (provisioned + state)
router.get('/offerings', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const companyObjId = new mongoose_1.default.Types.ObjectId(companyId);
        const offerings = await PlatformOffering_1.PlatformOffering.find({ isAvailable: true }).lean();
        const entitlements = await TenantEntitlement_1.TenantEntitlement.find({ companyId: companyObjId }).lean();
        const states = await TenantOfferingState_1.TenantOfferingState.find({ companyId: companyObjId }).lean();
        const entMap = Object.fromEntries(entitlements.map((e) => [e.offeringId, e]));
        const stateMap = Object.fromEntries(states.map((s) => [s.offeringId, s]));
        const result = offerings.map((o) => ({
            ...o,
            isProvisioned: entMap[o.offeringId]?.isProvisioned ?? false,
            isActive: stateMap[o.offeringId]?.isActive ?? false,
            toggledBy: stateMap[o.offeringId]?.toggledBy,
            deactivationReason: stateMap[o.offeringId]?.deactivationReason,
            allowedCapabilities: entMap[o.offeringId]?.configLimits?.allowedCapabilities ?? o.capabilities ?? []
        }));
        res.json({ offerings: result });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load offerings' });
    }
});
// PATCH /api/settings/offerings/:offeringId/state - Toggle tenant offering state
router.patch('/offerings/:offeringId/state', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { offeringId } = req.params;
        const { isActive, deactivationReason } = req.body;
        const companyObjId = new mongoose_1.default.Types.ObjectId(companyId);
        const ent = await TenantEntitlement_1.TenantEntitlement.findOne({ companyId: companyObjId, offeringId, isProvisioned: true });
        if (!ent)
            return res.status(403).json({ message: 'Offering not provisioned for this tenant' });
        const { User } = await Promise.resolve().then(() => __importStar(require('../models/User')));
        let toggledBy = 'unknown';
        if (req.userId) {
            const u = await User.findById(req.userId).select('email');
            if (u)
                toggledBy = u.email;
        }
        else {
            const company = await Company_1.Company.findById(companyId).select('email');
            toggledBy = company?.email ?? 'unknown';
        }
        const now = new Date();
        await TenantOfferingState_1.TenantOfferingState.findOneAndUpdate({ companyId: companyObjId, offeringId }, {
            $set: {
                isActive: isActive ?? false,
                [isActive ? 'activatedAt' : 'deactivatedAt']: now,
                toggledBy,
                deactivationReason: !isActive ? deactivationReason : undefined
            }
        }, { upsert: true, new: true });
        await (0, eventWriter_1.writeCallEvent)({
            companyId: companyObjId,
            eventType: 'OFFERING_TOGGLED',
            offeringId,
            payload: { isActive: isActive ?? false, toggledBy, deactivationReason: !isActive ? deactivationReason : undefined },
            source: 'agent',
            timestamp: now
        });
        res.json({ message: 'Offering state updated', isActive: isActive ?? false });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update offering state' });
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
// GET /api/settings/datasource (Tenant Admin, Campaign Manager)
router.get('/datasource', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const companyObjId = new mongoose_1.default.Types.ObjectId(companyId);
        let ds = await DataSourceConfig_1.DataSourceConfig.findOne({ companyId: companyObjId }).lean();
        if (!ds) {
            ds = {
                _id: null,
                companyId: companyObjId,
                mode: 'file',
                stalenessThresholdHours: 26,
                createdAt: new Date(),
                updatedAt: new Date()
            };
        }
        const stalenessHours = ds.stalenessThresholdHours ?? 26;
        const cutoff = new Date(Date.now() - stalenessHours * 60 * 60 * 1000);
        const staleCount = await AccountProfile_1.AccountProfile.countDocuments({
            companyId: companyObjId,
            status: { $in: ['ACTIVE', 'PAUSED'] },
            $or: [{ dataFreshnessAt: { $lt: cutoff } }, { dataFreshnessAt: null }]
        });
        const safe = {
            mode: ds.mode ?? 'file',
            pullUrl: ds.pullUrl ?? null,
            pullAuthType: ds.pullAuthType ?? null,
            pullAuthConfig: ds.pullAuthConfig
                ? { _masked: true }
                : null,
            pullScheduleCron: ds.pullScheduleCron ?? null,
            fieldMapping: ds.fieldMapping ?? {},
            stalenessThresholdHours: stalenessHours,
            lastSyncAt: ds.lastSyncAt ?? null,
            lastSyncStatus: ds.lastSyncStatus ?? null,
            pushHmacSecretSet: !!ds.pushHmacSecret,
            staleAccountCount: staleCount
        };
        res.json(safe);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load datasource config' });
    }
});
// PUT /api/settings/datasource (Tenant Admin, Campaign Manager)
router.put('/datasource', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const companyObjId = new mongoose_1.default.Types.ObjectId(companyId);
        const body = req.body;
        const update = {};
        if (body.mode !== undefined)
            update.mode = body.mode;
        if (body.pullUrl !== undefined)
            update.pullUrl = body.pullUrl || null;
        if (body.pullAuthType !== undefined)
            update.pullAuthType = body.pullAuthType || null;
        if (body.pullAuthConfig !== undefined) {
            const raw = body.pullAuthConfig;
            update.pullAuthConfig = raw && Object.keys(raw).length > 0 ? (0, credentialEncryption_1.encryptPullAuthConfig)(raw) : null;
        }
        if (body.pullScheduleCron !== undefined)
            update.pullScheduleCron = body.pullScheduleCron || null;
        if (body.fieldMapping !== undefined)
            update.fieldMapping = body.fieldMapping || {};
        if (body.stalenessThresholdHours !== undefined)
            update.stalenessThresholdHours = Math.max(1, Math.min(168, body.stalenessThresholdHours));
        if (body.pushHmacSecret !== undefined && body.pushHmacSecret.trim())
            update.pushHmacSecret = body.pushHmacSecret.trim();
        const ds = await DataSourceConfig_1.DataSourceConfig.findOneAndUpdate({ companyId: companyObjId }, { $set: update }, { new: true, upsert: true });
        res.json({ mode: ds?.mode, lastSyncAt: ds?.lastSyncAt, lastSyncStatus: ds?.lastSyncStatus });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update datasource config' });
    }
});
// POST /api/settings/datasource/regenerate-hmac (Tenant Admin, Campaign Manager)
router.post('/datasource/regenerate-hmac', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const companyObjId = new mongoose_1.default.Types.ObjectId(companyId);
        const secret = crypto_1.default.randomBytes(32).toString('hex');
        await DataSourceConfig_1.DataSourceConfig.findOneAndUpdate({ companyId: companyObjId }, { $set: { pushHmacSecret: secret } }, { new: true, upsert: true });
        res.json({ pushHmacSecret: secret });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to regenerate HMAC secret' });
    }
});
exports.default = router;
