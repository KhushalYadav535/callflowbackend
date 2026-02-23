"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const ruleEngine_1 = require("../services/ruleEngine");
const auth_1 = require("../middleware/auth");
const BotConfig_1 = require("../models/BotConfig");
const TenantEntitlement_1 = require("../models/TenantEntitlement");
const router = (0, express_1.Router)();
// GET /api/botconfigs - List BotConfigs for company (tenant instances only)
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const companyId = req.companyId;
        const configs = await BotConfig_1.BotConfig.find({ companyId, isTemplate: false })
            .sort({ updatedAt: -1 })
            .lean();
        res.json({ botconfigs: configs });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load BotConfigs' });
    }
});
// POST /api/botconfigs - Create BotConfig
router.post('/', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const ent = await TenantEntitlement_1.TenantEntitlement.findOne({ companyId, offeringId: req.body.offeringId, isProvisioned: true });
        if (!ent)
            return res.status(403).json({ message: 'Offering not provisioned for this tenant' });
        const allowedCaps = ent.configLimits?.allowedCapabilities ?? [];
        const caps = req.body.capabilities;
        if (caps) {
            for (const [k, v] of Object.entries(caps)) {
                if (v && !allowedCaps.includes(k)) {
                    return res.status(400).json({ message: `Capability "${k}" is not provisioned for this tenant` });
                }
            }
        }
        const bot = await BotConfig_1.BotConfig.create({
            ...req.body,
            companyId: new mongoose_1.default.Types.ObjectId(companyId),
            isTemplate: false
        });
        res.status(201).json(bot);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to create BotConfig' });
    }
});
// PUT /api/botconfigs/:id - Update BotConfig
router.put('/:id', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const bot = await BotConfig_1.BotConfig.findOne({ _id: req.params.id, companyId, isTemplate: false });
        if (!bot)
            return res.status(404).json({ message: 'BotConfig not found' });
        const { capabilities } = req.body;
        if (capabilities) {
            const ent = await TenantEntitlement_1.TenantEntitlement.findOne({ companyId, offeringId: bot.offeringId, isProvisioned: true });
            const allowedCaps = ent?.configLimits?.allowedCapabilities ?? [];
            for (const [k, v] of Object.entries(capabilities)) {
                if (v && !allowedCaps.includes(k)) {
                    return res.status(400).json({ message: `Capability "${k}" is not provisioned for this tenant` });
                }
            }
        }
        Object.assign(bot, req.body);
        await bot.save();
        res.json(bot);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update BotConfig' });
    }
});
// GET /api/botconfigs/:id/preview - Preview how many accounts match this BotConfig's trigger (CF2-BOT)
router.get('/:id/preview', auth_1.authMiddleware, async (req, res) => {
    try {
        const companyId = req.companyId;
        const bot = await BotConfig_1.BotConfig.findOne({ _id: req.params.id, companyId, isTemplate: false });
        if (!bot)
            return res.status(404).json({ message: 'BotConfig not found' });
        const count = await (0, ruleEngine_1.countMatchingAccounts)(new mongoose_1.default.Types.ObjectId(companyId), bot._id);
        res.json({ matchingAccountCount: count });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to compute preview' });
    }
});
// GET /api/botconfigs/templates - List templates (for provisioned offerings only)
router.get('/templates', auth_1.authMiddleware, async (req, res) => {
    try {
        const companyId = req.companyId;
        const ents = await TenantEntitlement_1.TenantEntitlement.find({ companyId, isProvisioned: true }).select('offeringId');
        const offeringIds = ents.map((e) => e.offeringId);
        const templates = await BotConfig_1.BotConfig.find({
            isTemplate: true,
            offeringId: { $in: offeringIds },
            $or: [{ isDeprecated: { $ne: true } }, { isDeprecated: { $exists: false } }]
        }).lean();
        res.json({ templates });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load templates' });
    }
});
// POST /api/botconfigs/clone - Clone template to tenant
router.post('/clone', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { templateId, name } = req.body;
        if (!templateId)
            return res.status(400).json({ message: 'templateId is required' });
        const template = await BotConfig_1.BotConfig.findOne({ _id: templateId, isTemplate: true });
        if (!template)
            return res.status(404).json({ message: 'Template not found' });
        if (template.isDeprecated) {
            return res.status(400).json({ message: 'This template is deprecated and cannot be cloned' });
        }
        const ent = await TenantEntitlement_1.TenantEntitlement.findOne({ companyId, offeringId: template.offeringId, isProvisioned: true });
        if (!ent)
            return res.status(403).json({ message: 'Offering not provisioned for this tenant' });
        const doc = template.toObject();
        delete doc._id;
        delete doc.createdAt;
        delete doc.updatedAt;
        const bot = await BotConfig_1.BotConfig.create({
            ...doc,
            companyId: new mongoose_1.default.Types.ObjectId(companyId),
            isTemplate: false,
            name: name ?? `${template.name} (clone)`,
            isActive: false
        });
        res.status(201).json(bot);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to clone template' });
    }
});
exports.default = router;
