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
const auth_1 = require("../middleware/auth");
const AccountProfile_1 = require("../models/AccountProfile");
const BotConfig_1 = require("../models/BotConfig");
const eventWriter_1 = require("../services/eventWriter");
const DispatchQueue_1 = require("../models/DispatchQueue");
const mongoose_1 = __importDefault(require("mongoose"));
const router = (0, express_1.Router)();
// GET /api/accounts - List AccountProfiles for company
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const companyId = req.companyId;
        const { page = '1', limit = '50', status, offeringId, botConfigId, productType, dpdMin, dpdMax, lastCalledFrom, lastCalledTo } = req.query;
        const pageNum = Math.max(parseInt(String(page), 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 200);
        const companyObjId = new mongoose_1.default.Types.ObjectId(companyId);
        const query = { companyId: companyObjId };
        if (status && String(status) !== 'ALL')
            query.status = String(status);
        if (productType)
            query.productType = String(productType);
        if (botConfigId)
            query.activeBotConfigId = new mongoose_1.default.Types.ObjectId(String(botConfigId));
        if (offeringId) {
            const botIds = await BotConfig_1.BotConfig.find({ companyId: companyObjId, offeringId: String(offeringId) }).select('_id').lean();
            query.activeBotConfigId = { $in: botIds.map((b) => b._id) };
        }
        if (dpdMin !== undefined || dpdMax !== undefined) {
            query.dpd = {};
            if (dpdMin !== undefined)
                query.dpd.$gte = parseInt(String(dpdMin), 10) || 0;
            if (dpdMax !== undefined)
                query.dpd.$lte = parseInt(String(dpdMax), 10) ?? 999;
        }
        if (lastCalledFrom || lastCalledTo) {
            query.lastCalledAt = {};
            if (lastCalledFrom)
                query.lastCalledAt.$gte = new Date(String(lastCalledFrom));
            if (lastCalledTo)
                query.lastCalledAt.$lte = new Date(String(lastCalledTo));
        }
        const { DataSourceConfig } = await Promise.resolve().then(() => __importStar(require('../models/DataSourceConfig')));
        const dsConfig = await DataSourceConfig.findOne({ companyId: companyObjId });
        const stalenessHours = dsConfig?.stalenessThresholdHours ?? 26;
        const cutoff = new Date(Date.now() - stalenessHours * 60 * 60 * 1000);
        const [accounts, total, statusStats, staleCount] = await Promise.all([
            AccountProfile_1.AccountProfile.find(query)
                .populate('activeBotConfigId', 'name offeringId')
                .sort({ updatedAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            AccountProfile_1.AccountProfile.countDocuments(query),
            AccountProfile_1.AccountProfile.aggregate([
                { $match: { companyId: companyObjId } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            AccountProfile_1.AccountProfile.countDocuments({
                companyId: companyObjId,
                status: { $in: ['ACTIVE', 'PAUSED'] },
                $or: [{ dataFreshnessAt: { $lt: cutoff } }, { dataFreshnessAt: null }]
            })
        ]);
        const statusCounts = {};
        for (const s of statusStats)
            statusCounts[s._id] = s.count;
        statusCounts.STALE = staleCount;
        res.json({
            accounts,
            pagination: { page: pageNum, limit: limitNum, total },
            stats: statusCounts
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load accounts' });
    }
});
// GET /api/accounts/:accountId - Get single AccountProfile
router.get('/:accountId', auth_1.authMiddleware, async (req, res) => {
    try {
        const companyId = req.companyId;
        const { accountId } = req.params;
        const account = await AccountProfile_1.AccountProfile.findOne({
            _id: accountId,
            companyId
        })
            .populate('activeBotConfigId')
            .lean();
        if (!account)
            return res.status(404).json({ message: 'Account not found' });
        res.json(account);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load account' });
    }
});
// PATCH /api/accounts/:accountId/pause - Pause account (remove from queue)
router.patch('/:accountId/pause', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER', 'RECOVERY_AGENT'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { accountId } = req.params;
        const account = await AccountProfile_1.AccountProfile.findOne({ _id: accountId, companyId });
        if (!account)
            return res.status(404).json({ message: 'Account not found' });
        await AccountProfile_1.AccountProfile.updateOne({ _id: accountId }, { $set: { status: 'PAUSED' } });
        res.json({ message: 'Account paused', status: 'PAUSED' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to pause account' });
    }
});
// PATCH /api/accounts/:accountId/exclude - Exclude account permanently
router.patch('/:accountId/exclude', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER', 'RECOVERY_AGENT'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { accountId } = req.params;
        const account = await AccountProfile_1.AccountProfile.findOne({ _id: accountId, companyId });
        if (!account)
            return res.status(404).json({ message: 'Account not found' });
        await AccountProfile_1.AccountProfile.updateOne({ _id: accountId }, { $set: { status: 'EXCLUDED' } });
        res.json({ message: 'Account excluded', status: 'EXCLUDED' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to exclude account' });
    }
});
// PATCH /api/accounts/:accountId/disposition - Manual disposition update (CF2-OVR)
router.patch('/:accountId/disposition', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER', 'RECOVERY_AGENT'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { accountId } = req.params;
        const { disposition, promiseToPayDate, note } = req.body;
        if (!disposition || typeof disposition !== 'string' || !disposition.trim()) {
            return res.status(400).json({ message: 'disposition is required' });
        }
        const account = await AccountProfile_1.AccountProfile.findOne({ _id: accountId, companyId }).populate('activeBotConfigId');
        if (!account)
            return res.status(404).json({ message: 'Account not found' });
        const bot = account.activeBotConfigId;
        await (0, eventWriter_1.writeCallEvent)({
            companyId: new mongoose_1.default.Types.ObjectId(companyId),
            accountId: new mongoose_1.default.Types.ObjectId(accountId),
            botConfigId: bot?._id,
            offeringId: bot?.offeringId,
            eventType: 'DISPOSITION_SET',
            payload: {
                disposition: disposition.trim(),
                setBy: 'agent',
                promiseToPayDate: promiseToPayDate ? new Date(promiseToPayDate) : undefined,
                note: note || undefined
            },
            source: 'agent',
            timestamp: new Date()
        });
        if (['paid', 'set_account_completed', 'close_cycle', 'acknowledged', 'payment_scheduled'].includes(disposition.toLowerCase())) {
            await AccountProfile_1.AccountProfile.updateOne({ _id: accountId }, { $set: { status: 'COMPLETED' } });
            await DispatchQueue_1.DispatchQueue.deleteOne({ accountId: new mongoose_1.default.Types.ObjectId(accountId) });
        }
        res.json({ message: 'Disposition updated', disposition: disposition.trim() });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update disposition' });
    }
});
// PATCH /api/accounts/:accountId/assign - Assign BotConfig to account
router.patch('/:accountId/assign', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { accountId } = req.params;
        const { activeBotConfigId } = req.body;
        if (!activeBotConfigId)
            return res.status(400).json({ message: 'activeBotConfigId is required' });
        const { BotConfig } = await Promise.resolve().then(() => __importStar(require('../models/BotConfig')));
        const bot = await BotConfig.findOne({ _id: activeBotConfigId, companyId });
        if (!bot)
            return res.status(404).json({ message: 'BotConfig not found' });
        const account = await AccountProfile_1.AccountProfile.findOne({ _id: accountId, companyId });
        if (!account)
            return res.status(404).json({ message: 'Account not found' });
        await AccountProfile_1.AccountProfile.updateOne({ _id: accountId }, { $set: { activeBotConfigId: bot._id, status: 'ACTIVE' } });
        res.json({ message: 'Bot assigned', activeBotConfigId: bot._id });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to assign bot' });
    }
});
// GET /api/accounts/:accountId/notes - List notes for account
router.get('/:accountId/notes', auth_1.authMiddleware, async (req, res) => {
    try {
        const companyId = req.companyId;
        const { accountId } = req.params;
        const account = await AccountProfile_1.AccountProfile.findOne({ _id: accountId, companyId });
        if (!account)
            return res.status(404).json({ message: 'Account not found' });
        const { AccountNote } = await Promise.resolve().then(() => __importStar(require('../models/AccountNote')));
        const notes = await AccountNote.find({ accountId, companyId: new mongoose_1.default.Types.ObjectId(companyId) })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
        res.json({ notes });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load notes' });
    }
});
// POST /api/accounts/:accountId/notes - Add note to account (CF2-ACCT manual action)
router.post('/:accountId/notes', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER', 'RECOVERY_AGENT'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { accountId } = req.params;
        const { note } = req.body;
        if (!note || typeof note !== 'string' || !note.trim())
            return res.status(400).json({ message: 'note is required' });
        const account = await AccountProfile_1.AccountProfile.findOne({ _id: accountId, companyId });
        if (!account)
            return res.status(404).json({ message: 'Account not found' });
        const { AccountNote } = await Promise.resolve().then(() => __importStar(require('../models/AccountNote')));
        const { User } = await Promise.resolve().then(() => __importStar(require('../models/User')));
        let createdBy = 'unknown';
        if (req.userId) {
            const u = await User.findById(req.userId).select('email');
            if (u)
                createdBy = u.email;
        }
        const n = await AccountNote.create({
            accountId: new mongoose_1.default.Types.ObjectId(accountId),
            companyId: new mongoose_1.default.Types.ObjectId(companyId),
            note: note.trim(),
            createdBy
        });
        await (0, eventWriter_1.writeCallEvent)({
            companyId: new mongoose_1.default.Types.ObjectId(companyId),
            accountId: new mongoose_1.default.Types.ObjectId(accountId),
            eventType: 'MANUAL_OVERRIDE',
            payload: { action: 'add_note', note: note.trim(), createdBy },
            source: 'agent',
            timestamp: new Date()
        });
        res.status(201).json(n);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to add note' });
    }
});
exports.default = router;
