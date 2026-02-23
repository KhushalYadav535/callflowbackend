"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const adminAuth_1 = require("../middleware/adminAuth");
const Company_1 = require("../models/Company");
const User_1 = require("../models/User");
const PlatformOffering_1 = require("../models/PlatformOffering");
const TenantEntitlement_1 = require("../models/TenantEntitlement");
const TenantOfferingState_1 = require("../models/TenantOfferingState");
const BotConfig_1 = require("../models/BotConfig");
const AccountProfile_1 = require("../models/AccountProfile");
const CallEvent_1 = require("../models/CallEvent");
const ComplianceConfig_1 = require("../models/ComplianceConfig");
const DataSourceConfig_1 = require("../models/DataSourceConfig");
const eventWriter_1 = require("../services/eventWriter");
const router = (0, express_1.Router)();
router.use(adminAuth_1.platformAdminMiddleware);
// GET /api/admin/dashboard - Overview stats (CF2-PADM-001)
router.get('/dashboard', async (_req, res) => {
    try {
        const oneMinAgo = new Date(Date.now() - 60 * 1000);
        const [tenantCount, accountCount, eventCountToday, eventCountLastMin, offerings] = await Promise.all([
            Company_1.Company.countDocuments(),
            AccountProfile_1.AccountProfile.countDocuments(),
            CallEvent_1.CallEvent.countDocuments({
                timestamp: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
            }),
            CallEvent_1.CallEvent.countDocuments({ timestamp: { $gte: oneMinAgo } }),
            PlatformOffering_1.PlatformOffering.find({ isAvailable: true }).lean()
        ]);
        res.json({
            tenants: tenantCount,
            accounts: accountCount,
            eventsToday: eventCountToday,
            eventsPerMinute: eventCountLastMin,
            offerings: offerings.map((o) => ({ offeringId: o.offeringId, name: o.name, isAvailable: o.isAvailable }))
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load dashboard' });
    }
});
// GET /api/admin/tenants - List all tenants with stats
router.get('/tenants', async (_req, res) => {
    try {
        const tenants = await Company_1.Company.find({})
            .select('name email companyType createdAt')
            .sort({ createdAt: -1 })
            .lean();
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const syncFailedTenants = await CallEvent_1.CallEvent.distinct('companyId', {
            eventType: 'SYNC_FAILED',
            timestamp: { $gte: oneHourAgo }
        });
        const syncFailedSet = new Set(syncFailedTenants.map((id) => id?.toString()).filter(Boolean));
        const result = await Promise.all(tenants.map(async (t) => {
            const [accountCount, eventCountToday, entitlements, lastSync] = await Promise.all([
                AccountProfile_1.AccountProfile.countDocuments({ companyId: t._id }),
                CallEvent_1.CallEvent.countDocuments({
                    companyId: t._id,
                    timestamp: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
                }),
                TenantEntitlement_1.TenantEntitlement.find({ companyId: t._id, isProvisioned: true }).select('offeringId'),
                DataSourceConfig_1.DataSourceConfig.findOne({ companyId: t._id }).select('lastSyncAt lastSyncStatus mode')
            ]);
            return {
                ...t,
                accountCount,
                callsToday: eventCountToday,
                activeOfferings: entitlements.map((e) => e.offeringId),
                lastSyncAt: lastSync?.lastSyncAt,
                lastSyncStatus: lastSync?.lastSyncStatus,
                syncMode: lastSync?.mode,
                syncFailedLastHour: syncFailedSet.has(t._id.toString())
            };
        }));
        res.json({ tenants: result });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load tenants' });
    }
});
// POST /api/admin/tenants - Create new tenant
router.post('/tenants', async (req, res) => {
    try {
        const { name, email, password, companyType } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'name, email and password are required' });
        }
        const emailNorm = String(email).trim().toLowerCase();
        const existing = await Company_1.Company.findOne({ email: emailNorm });
        if (existing)
            return res.status(409).json({ message: 'Email already registered' });
        const hashed = await bcryptjs_1.default.hash(password, 10);
        const company = await Company_1.Company.create({
            name,
            email: emailNorm,
            password: hashed,
            companyType: companyType || undefined
        });
        await User_1.User.create({
            companyId: company._id,
            email: emailNorm,
            password: hashed,
            name,
            role: 'TENANT_ADMIN'
        });
        await ComplianceConfig_1.ComplianceConfig.create({
            companyId: company._id,
            callingWindowStart: '09:00',
            callingWindowEnd: '19:00',
            timezone: 'Asia/Kolkata'
        });
        res.status(201).json({
            tenant: {
                id: company._id,
                name: company.name,
                email: company.email
            }
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to create tenant' });
    }
});
// GET /api/admin/tenants/:companyId - Tenant detail with users
router.get('/tenants/:companyId', async (req, res) => {
    try {
        const { companyId } = req.params;
        const company = await Company_1.Company.findById(companyId).select('-password');
        if (!company)
            return res.status(404).json({ message: 'Tenant not found' });
        const [users, entitlements, states, accountCount] = await Promise.all([
            User_1.User.find({ companyId }).select('email name role').lean(),
            TenantEntitlement_1.TenantEntitlement.find({ companyId }).lean(),
            TenantOfferingState_1.TenantOfferingState.find({ companyId }).lean(),
            AccountProfile_1.AccountProfile.countDocuments({ companyId })
        ]);
        res.json({
            tenant: company,
            users,
            entitlements,
            offeringStates: states,
            accountCount
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load tenant' });
    }
});
// POST /api/admin/entitlements - Provision offering to tenant
router.post('/entitlements', async (req, res) => {
    try {
        const adminEmail = req.adminEmail || 'admin';
        const { companyId, offeringId, allowedCapabilities } = req.body;
        if (!companyId || !offeringId) {
            return res.status(400).json({ message: 'companyId and offeringId are required' });
        }
        const offering = await PlatformOffering_1.PlatformOffering.findOne({ offeringId });
        if (!offering)
            return res.status(404).json({ message: 'Offering not found' });
        const company = await Company_1.Company.findById(companyId);
        if (!company)
            return res.status(404).json({ message: 'Tenant not found' });
        const caps = Array.isArray(allowedCapabilities) ? allowedCapabilities : (offering.capabilities ?? []);
        const now = new Date();
        await TenantEntitlement_1.TenantEntitlement.findOneAndUpdate({ companyId, offeringId }, {
            $set: {
                isProvisioned: true,
                provisionedAt: now,
                provisionedBy: adminEmail,
                configLimits: { allowedCapabilities: caps }
            }
        }, { upsert: true });
        await TenantOfferingState_1.TenantOfferingState.findOneAndUpdate({ companyId, offeringId }, { $set: { isActive: true, activatedAt: now, toggledBy: adminEmail } }, { upsert: true });
        res.json({ message: 'Offering provisioned', offeringId });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to provision offering' });
    }
});
// DELETE /api/admin/entitlements - Revoke offering from tenant
router.delete('/entitlements', async (req, res) => {
    try {
        const { companyId, offeringId } = req.query;
        if (!companyId || !offeringId) {
            return res.status(400).json({ message: 'companyId and offeringId are required' });
        }
        await TenantEntitlement_1.TenantEntitlement.updateOne({ companyId: new mongoose_1.default.Types.ObjectId(String(companyId)), offeringId: String(offeringId) }, { $set: { isProvisioned: false } });
        await TenantOfferingState_1.TenantOfferingState.updateOne({ companyId: new mongoose_1.default.Types.ObjectId(String(companyId)), offeringId: String(offeringId) }, { $set: { isActive: false } });
        await BotConfig_1.BotConfig.updateMany({ companyId: new mongoose_1.default.Types.ObjectId(String(companyId)), offeringId: String(offeringId) }, { $set: { isActive: false } });
        res.json({ message: 'Offering revoked' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to revoke offering' });
    }
});
// GET /api/admin/offerings - List all platform offerings (must be before :offeringId)
router.get('/offerings', async (_req, res) => {
    try {
        const offerings = await PlatformOffering_1.PlatformOffering.find({}).sort({ offeringId: 1 }).lean();
        res.json({ offerings });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load offerings' });
    }
});
// PUT /api/admin/offerings/:offeringId - Toggle platform offering availability
router.put('/offerings/:offeringId', async (req, res) => {
    try {
        const adminEmail = req.adminEmail || 'platform_admin';
        const { offeringId } = req.params;
        const { isAvailable } = req.body;
        const offering = await PlatformOffering_1.PlatformOffering.findOneAndUpdate({ offeringId }, { $set: { isAvailable: isAvailable ?? true } }, { new: true });
        if (!offering)
            return res.status(404).json({ message: 'Offering not found' });
        await (0, eventWriter_1.writeCallEvent)({
            companyId: new mongoose_1.default.Types.ObjectId('000000000000000000000000'), // platform-level event
            eventType: 'OFFERING_TOGGLED',
            offeringId,
            payload: { isAvailable: offering.isAvailable, toggledBy: adminEmail, level: 'platform' },
            source: 'platform_admin',
            timestamp: new Date()
        });
        res.json({ offering });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update offering' });
    }
});
// GET /api/admin/templates - List BotConfig templates
router.get('/templates', async (_req, res) => {
    try {
        const templates = await BotConfig_1.BotConfig.find({ isTemplate: true }).lean();
        res.json({ templates });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load templates' });
    }
});
// Default template configs by offering (for quick-create)
const DEFAULT_TEMPLATE_CONFIG = {
    'reminder-bot': {
        trigger: { conditions: [{ field: 'dpd', operator: 'eq', value: 0 }, { field: 'dueDate', operator: 'within_days', value: 7 }] },
        script: { voice: 'sonia', language: 'hi-IN', promptTemplate: 'Reminder: Your payment of {{amount}} is due on {{dueDate}}.' },
        dispositions: [
            { value: 'acknowledged', label: 'Payment Acknowledged', action: 'close_cycle', terminal: true },
            { value: 'payment_scheduled', label: 'Payment Scheduled', action: 'close_cycle', terminal: true },
            { value: 'callback_requested', label: 'Will Call Back', action: 'schedule_callback', terminal: false },
            { value: 'not_reachable', label: 'Not Reachable', action: 'retry', terminal: false }
        ],
        retryRules: { maxAttempts: 3, intervalHours: 24 },
        compliance: { callingWindow: { start: '09:00', end: '19:00' }, timezone: 'Asia/Kolkata', dndCheck: true, maxAttemptsPerDay: 3 }
    },
    'recovery-bot': {
        trigger: { conditions: [{ field: 'dpd', operator: 'gte', value: 1 }] },
        script: { voice: 'sonia', language: 'hi-IN', promptTemplate: 'Recovery: Your overdue amount {{amount}} is past due. Please make payment.' },
        dispositions: [
            { value: 'paid', label: 'Paid', action: 'set_account_completed', terminal: true },
            { value: 'promise_to_pay', label: 'Promise to Pay', action: 'capture_ptp_date', terminal: false },
            { value: 'dispute', label: 'Dispute', action: 'escalate_to_agent', terminal: false },
            { value: 'not_reachable', label: 'Not Reachable', action: 'retry', terminal: false }
        ],
        retryRules: { maxAttempts: 5, intervalHours: 8 },
        compliance: { callingWindow: { start: '08:00', end: '19:00' }, timezone: 'Asia/Kolkata', dndCheck: true, maxAttemptsPerDay: 3 }
    }
};
const FALLBACK_TEMPLATE = {
    trigger: { conditions: [{ field: 'dpd', operator: 'gte', value: 0 }] },
    script: { voice: 'sonia', language: 'en-IN', promptTemplate: 'Hello {{customerName}}, this is a reminder call.' },
    dispositions: [
        { value: 'acknowledged', label: 'Acknowledged', action: 'close_cycle', terminal: true },
        { value: 'not_reachable', label: 'Not Reachable', action: 'retry', terminal: false }
    ],
    retryRules: { maxAttempts: 3, intervalHours: 24 },
    compliance: { callingWindow: { start: '09:00', end: '19:00' }, timezone: 'Asia/Kolkata', dndCheck: true, maxAttemptsPerDay: 3 }
};
// POST /api/admin/templates - Create BotConfig template
router.post('/templates', async (req, res) => {
    try {
        const adminEmail = req.adminEmail || 'admin';
        const { offeringId, name, trigger, script, dispositions, retryRules, compliance, escalation, capabilities, useDefaults } = req.body;
        if (!offeringId || !name) {
            return res.status(400).json({ message: 'offeringId and name are required' });
        }
        const offering = await PlatformOffering_1.PlatformOffering.findOne({ offeringId });
        if (!offering)
            return res.status(404).json({ message: 'Offering not found' });
        let cfg;
        if (useDefaults || (!trigger && !script && !dispositions && !retryRules && !compliance)) {
            cfg = DEFAULT_TEMPLATE_CONFIG[offeringId] || FALLBACK_TEMPLATE;
        }
        else if (trigger && script && dispositions && retryRules && compliance) {
            cfg = { trigger, script, dispositions, retryRules, compliance };
        }
        else {
            return res.status(400).json({
                message: 'Either useDefaults or full config (trigger, script, dispositions, retryRules, compliance) required'
            });
        }
        const template = await BotConfig_1.BotConfig.create({
            companyId: null,
            offeringId,
            name: String(name).trim(),
            isTemplate: true,
            isActive: true,
            version: '1.0.0',
            trigger: cfg.trigger,
            script: cfg.script,
            dispositions: cfg.dispositions,
            retryRules: cfg.retryRules,
            compliance: cfg.compliance,
            escalation: escalation ?? undefined,
            capabilities: capabilities ?? undefined,
            createdBy: adminEmail
        });
        res.status(201).json({ template });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to create template' });
    }
});
// PATCH /api/admin/templates/:templateId - Deprecate or update template
router.patch('/templates/:templateId', async (req, res) => {
    try {
        const { templateId } = req.params;
        const { isDeprecated } = req.body;
        const template = await BotConfig_1.BotConfig.findOne({ _id: templateId, isTemplate: true });
        if (!template)
            return res.status(404).json({ message: 'Template not found' });
        if (typeof isDeprecated === 'boolean') {
            ;
            template.isDeprecated = isDeprecated;
            await template.save();
        }
        res.json({ template });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update template' });
    }
});
// POST /api/admin/templates/:templateId/clone - Clone template to tenant (CF2-PADM-003)
router.post('/templates/:templateId/clone', async (req, res) => {
    try {
        const adminEmail = req.adminEmail || 'admin';
        const { templateId } = req.params;
        const { companyId, name } = req.body;
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const template = await BotConfig_1.BotConfig.findOne({ _id: templateId, isTemplate: true });
        if (!template)
            return res.status(404).json({ message: 'Template not found' });
        if (template.isDeprecated) {
            return res.status(400).json({ message: 'Cannot clone deprecated template' });
        }
        const company = await Company_1.Company.findById(companyId);
        if (!company)
            return res.status(404).json({ message: 'Tenant not found' });
        const ent = await TenantEntitlement_1.TenantEntitlement.findOne({ companyId, offeringId: template.offeringId, isProvisioned: true });
        if (!ent)
            return res.status(400).json({ message: 'Offering not provisioned for this tenant' });
        const doc = template.toObject();
        delete doc._id;
        delete doc.createdAt;
        delete doc.updatedAt;
        const bot = await BotConfig_1.BotConfig.create({
            ...doc,
            companyId: new mongoose_1.default.Types.ObjectId(companyId),
            name: name && String(name).trim() ? String(name).trim() : `${template.name} (${company.name})`,
            isTemplate: false,
            createdBy: adminEmail
        });
        res.status(201).json({ template: template, bot });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to clone template' });
    }
});
// PUT /api/admin/templates/:templateId - Edit template (creates new version, prior remains)
router.put('/templates/:templateId', async (req, res) => {
    try {
        const adminEmail = req.adminEmail || 'admin';
        const { templateId } = req.params;
        const { name, trigger, script, dispositions, retryRules, compliance, escalation, capabilities } = req.body;
        const existing = await BotConfig_1.BotConfig.findOne({ _id: templateId, isTemplate: true });
        if (!existing)
            return res.status(404).json({ message: 'Template not found' });
        const nextVersion = existing.version ? incrementVersion(existing.version) : '1.0.1';
        const updated = await BotConfig_1.BotConfig.create({
            companyId: null,
            offeringId: existing.offeringId,
            name: name ?? existing.name,
            isTemplate: true,
            isActive: true,
            version: nextVersion,
            parentTemplateId: existing._id,
            trigger: trigger ?? existing.trigger,
            script: script ?? existing.script,
            dispositions: dispositions ?? existing.dispositions,
            retryRules: retryRules ?? existing.retryRules,
            compliance: compliance ?? existing.compliance,
            escalation: escalation ?? existing.escalation,
            capabilities: capabilities ?? existing.capabilities,
            createdBy: adminEmail
        });
        res.json({ template: updated, previousVersion: existing.version });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to create new template version' });
    }
});
function incrementVersion(v) {
    const parts = v.split('.').map(Number);
    if (parts.length >= 3) {
        parts[2] = (parts[2] || 0) + 1;
        return parts.join('.');
    }
    if (parts.length === 2)
        return `${parts[0]}.${parts[1]}.1`;
    return '1.0.1';
}
// GET /api/admin/analytics - Platform-wide analytics
router.get('/analytics', async (_req, res) => {
    try {
        const dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - 30);
        const [byTenant, totalDispatched, totalConnected] = await Promise.all([
            CallEvent_1.CallEvent.aggregate([
                { $match: { eventType: 'CALL_DISPATCHED', timestamp: { $gte: dateFrom } } },
                { $group: { _id: '$companyId', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 20 }
            ]),
            CallEvent_1.CallEvent.countDocuments({ eventType: 'CALL_DISPATCHED', timestamp: { $gte: dateFrom } }),
            CallEvent_1.CallEvent.countDocuments({ eventType: 'CALL_CONNECTED', timestamp: { $gte: dateFrom } })
        ]);
        res.json({
            byTenant,
            totalDispatched,
            totalConnected,
            connectRate: totalDispatched > 0 ? Math.round((totalConnected / totalDispatched) * 1000) / 10 : 0
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load analytics' });
    }
});
exports.default = router;
