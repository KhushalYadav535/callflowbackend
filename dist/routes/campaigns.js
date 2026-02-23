"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middleware/auth");
const Campaign_1 = require("../models/Campaign");
const Contact_1 = require("../models/Contact");
const parseContacts_1 = require("../utils/parseContacts");
const Company_1 = require("../models/Company");
const ComplianceConfig_1 = require("../models/ComplianceConfig");
const DndList_1 = require("../models/DndList");
const eventWriter_1 = require("../services/eventWriter");
const phoneNormalize_1 = require("../utils/phoneNormalize");
const mongoose_1 = __importDefault(require("mongoose"));
const axios_1 = __importDefault(require("axios"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// POST /api/campaigns/create (Tenant Admin, Campaign Manager)
router.post('/create', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), upload.single('file'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { name, type, voice, language, maxRetries, retryAfterHours } = req.body;
        if (!name || !type || !voice || !language) {
            return res
                .status(400)
                .json({ message: 'name, type, voice and language are required' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'file is required' });
        }
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
            'application/csv',
            'text/plain'
        ];
        const allowedExts = ['.xlsx', '.xls', '.csv'];
        const fname = (req.file.originalname || '').toLowerCase();
        const validMime = allowedMimes.includes(req.file.mimetype);
        const validExt = allowedExts.some((e) => fname.endsWith(e));
        if (!validMime && !validExt) {
            return res.status(400).json({ message: 'Only Excel (.xlsx, .xls) and CSV files are supported' });
        }
        let contactsData;
        try {
            contactsData = (0, parseContacts_1.parseContactsFromBuffer)(req.file.buffer);
        }
        catch (parseErr) {
            return res.status(400).json({
                message: parseErr?.message || 'Only Excel and CSV files are supported'
            });
        }
        const maxRetriesNum = maxRetries != null ? Math.min(10, Math.max(1, Number(maxRetries) || 3)) : undefined;
        const campaign = await Campaign_1.Campaign.create({
            companyId: new mongoose_1.default.Types.ObjectId(companyId),
            name,
            type,
            voice,
            language,
            maxRetries: maxRetriesNum,
            retryAfterHours: retryAfterHours ? Number(retryAfterHours) : undefined,
            totalContacts: contactsData.length
        });
        if (contactsData.length > 0) {
            const contactsToInsert = contactsData.map((c) => ({
                campaignId: campaign._id,
                companyId: campaign.companyId,
                name: c.name,
                phone: c.phone,
                amount: c.amount,
                dueDate: c.dueDate,
                loanType: c.loanType,
                email: c.email,
                city: c.city,
                callStatus: 'PENDING'
            }));
            await Contact_1.Contact.insertMany(contactsToInsert);
        }
        const previewContacts = contactsData.length > 0
            ? await Contact_1.Contact.find({ campaignId: campaign._id })
                .sort({ createdAt: 1 })
                .limit(50)
            : [];
        res.status(201).json({
            campaign,
            contacts: previewContacts,
            totalCount: contactsData.length
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            message: err?.message || 'Failed to create campaign from file'
        });
    }
});
// GET /api/campaigns
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const companyId = req.companyId;
        const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(String(req.query.limit || '10'), 10) || 10, 1), 100);
        const skip = (page - 1) * limit;
        const search = String(req.query.search || '').trim();
        const filterType = req.query.type;
        const filterStatus = req.query.status;
        const matchQuery = { companyId };
        if (search)
            matchQuery.name = { $regex: search, $options: 'i' };
        if (filterType && ['RECOVERY', 'REMINDER', 'SALES'].includes(filterType.toUpperCase())) {
            matchQuery.type = filterType.toUpperCase();
        }
        if (filterStatus) {
            const statusMap = {
                draft: 'DRAFT',
                scheduled: 'DRAFT',
                running: 'ACTIVE',
                completed: 'COMPLETED',
                paused: 'PAUSED',
            };
            const s = statusMap[filterStatus.toLowerCase()];
            if (s)
                matchQuery.status = s;
            if (filterStatus.toLowerCase() === 'scheduled')
                matchQuery.status = 'DRAFT';
        }
        const [campaigns, total] = await Promise.all([
            Campaign_1.Campaign.find(matchQuery).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Campaign_1.Campaign.countDocuments(matchQuery),
        ]);
        const campaignIds = campaigns.map((c) => c._id);
        const statsAgg = await Contact_1.Contact.aggregate([
            { $match: { campaignId: { $in: campaignIds }, companyId: new mongoose_1.default.Types.ObjectId(companyId) } },
            {
                $group: {
                    _id: '$campaignId',
                    total: { $sum: 1 },
                    pending: { $sum: { $cond: [{ $eq: ['$callStatus', 'PENDING'] }, 1, 0] } },
                    called: {
                        $sum: {
                            $cond: [
                                {
                                    $in: [
                                        '$callStatus',
                                        ['CALLING', 'CONNECTED', 'NOT_ANSWERED', 'FAILED', 'MAX_RETRY_DONE', 'PAID', 'OPT_OUT', 'DND_EXCLUDED', 'WITHDRAWN']
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    connected: { $sum: { $cond: [{ $eq: ['$callStatus', 'CONNECTED'] }, 1, 0] } }
                }
            }
        ]);
        const statsMap = new Map(statsAgg.map((s) => [s._id.toString(), s]));
        const campaignsWithStats = campaigns.map((c) => {
            const s = statsMap.get(c._id.toString());
            const called = s?.called ?? 0;
            const connected = s?.connected ?? 0;
            const pending = s?.pending ?? 0;
            const successRate = called > 0 ? Math.round((connected / called) * 1000) / 10 : 0;
            return {
                ...c.toObject(),
                stats: { called, pending, connected, successRate }
            };
        });
        res.json({
            campaigns: campaignsWithStats,
            pagination: { page, limit, total },
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load campaigns' });
    }
});
// GET /api/campaigns/:id
router.get('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const companyId = req.companyId;
        const { id } = req.params;
        const campaign = await Campaign_1.Campaign.findOne({ _id: id, companyId });
        if (!campaign) {
            return res.status(404).json({ message: 'Campaign not found' });
        }
        const stats = await Contact_1.Contact.aggregate([
            { $match: { campaignId: campaign._id } },
            {
                $group: {
                    _id: '$callStatus',
                    count: { $sum: 1 }
                }
            }
        ]);
        const statusCounts = {};
        for (const s of stats) {
            statusCounts[s._id] = s.count;
        }
        res.json({ campaign, stats: statusCounts });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load campaign' });
    }
});
// PATCH /api/campaigns/:id/launch (Tenant Admin, Campaign Manager)
router.patch('/:id/launch', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
        const { id } = req.params;
        const campaign = await Campaign_1.Campaign.findOne({ _id: id, companyId });
        if (!campaign) {
            return res.status(404).json({ message: 'Campaign not found' });
        }
        const complianceConfig = await ComplianceConfig_1.ComplianceConfig.findOne({ companyId: companyObjectId });
        const tz = complianceConfig?.timezone ?? 'Asia/Kolkata';
        const windowStart = complianceConfig?.callingWindowStart ?? '09:00';
        const windowEnd = complianceConfig?.callingWindowEnd ?? '19:00';
        try {
            const formatter = new Intl.DateTimeFormat('en-GB', {
                timeZone: tz,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            const [hours, mins] = formatter.format(new Date()).split(':').map(Number);
            const currentHHMM = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
            const [startH, startM] = windowStart.split(':').map(Number);
            const [endH, endM] = windowEnd.split(':').map(Number);
            const currentMins = hours * 60 + mins;
            const startMins = startH * 60 + startM;
            const endMins = endH * 60 + endM;
            if (currentMins < startMins || currentMins >= endMins) {
                return res.status(400).json({
                    message: `Launch rejected: current time ${currentHHMM} is outside calling window ${windowStart}–${windowEnd} (${tz})`
                });
            }
        }
        catch {
            // If timezone fails, allow launch (fallback)
        }
        const company = await Company_1.Company.findById(companyId).select('n8nWebhookUrl backendBaseUrl');
        const n8nUrl = company?.n8nWebhookUrl || process.env.N8N_WEBHOOK_URL;
        const backendBaseUrl = company?.backendBaseUrl || process.env.BACKEND_BASE_URL || '';
        if (!n8nUrl) {
            return res
                .status(400)
                .json({ message: 'n8n webhook URL is not configured for this company. Set it in Settings.' });
        }
        const excludeStatuses = ['PAID', 'OPT_OUT', 'DND_EXCLUDED', 'WITHDRAWN', 'MAX_RETRY_DONE', 'REASSIGNED'];
        const now = new Date();
        const [pendingContacts, retryContacts] = await Promise.all([
            Contact_1.Contact.find({ campaignId: campaign._id, companyId, callStatus: 'PENDING' }),
            Contact_1.Contact.find({
                campaignId: campaign._id,
                companyId,
                callStatus: 'NOT_ANSWERED',
                $or: [{ nextRetryAt: { $lte: now } }, { nextRetryAt: null }]
            })
        ]);
        let toDispatch = [...pendingContacts, ...retryContacts];
        const dndNumbers = await DndList_1.DndList.find({ companyId: companyObjectId }).select('phoneNormalised');
        const dndSet = new Set(dndNumbers.map((d) => d.phoneNormalised));
        const optOutPhones = await Contact_1.Contact.find({ companyId: companyObjectId, callStatus: 'OPT_OUT' })
            .select('phone')
            .lean();
        const optOutSet = new Set(optOutPhones.map((c) => (0, phoneNormalize_1.normalisePhone)(c.phone)).filter(Boolean));
        const toExclude = [];
        const toOptOut = [];
        for (const c of toDispatch) {
            const norm = (0, phoneNormalize_1.normalisePhone)(c.phone);
            if (dndSet.has(norm)) {
                toExclude.push(c._id);
            }
            else if (optOutSet.has(norm)) {
                toOptOut.push(c._id);
            }
        }
        if (toExclude.length) {
            await Contact_1.Contact.updateMany({ _id: { $in: toExclude } }, { $set: { callStatus: 'DND_EXCLUDED' } });
            toDispatch = toDispatch.filter((c) => !toExclude.some((id) => id.equals(c._id)));
        }
        if (toOptOut.length) {
            await Contact_1.Contact.updateMany({ _id: { $in: toOptOut } }, { $set: { callStatus: 'OPT_OUT' } });
            toDispatch = toDispatch.filter((c) => !toOptOut.some((id) => id.equals(c._id)));
        }
        campaign.status = 'ACTIVE';
        await campaign.save();
        if (toDispatch.length === 0) {
            return res.json({ message: 'Campaign launched', queued: 0, contactsDispatched: 0 });
        }
        // Fire-and-forget: enqueue contacts to n8n
        const payloads = toDispatch.map((contact) => ({
            contactId: contact._id,
            campaignId: campaign._id,
            companyId,
            name: contact.name,
            phone: contact.phone,
            amount: contact.amount,
            dueDate: contact.dueDate,
            loanType: contact.loanType,
            email: contact.email,
            city: contact.city,
            maxRetries: campaign.maxRetries,
            retryAfterHours: campaign.retryAfterHours,
            campaignType: campaign.type,
            voice: campaign.voice,
            language: campaign.language,
            backendBaseUrl: backendBaseUrl || undefined
        }));
        // Batched dispatch: 10 at a time, 500ms delay between batches (rate limiting)
        const BATCH_SIZE = 10;
        const BATCH_DELAY_MS = 500;
        const batches = [];
        for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
            batches.push(payloads.slice(i, i + BATCH_SIZE));
        }
        void (async () => {
            for (let b = 0; b < batches.length; b++) {
                await Promise.all(batches[b].map(async (body) => {
                    try {
                        await axios_1.default.post(n8nUrl, body);
                        await (0, eventWriter_1.writeCallEvent)({
                            companyId: companyObjectId,
                            contactId: body.contactId,
                            campaignId: campaign._id,
                            eventType: 'CALL_DISPATCHED',
                            payload: { dispatchedAt: new Date(), triggerReason: 'campaign_launch' },
                            source: 'system',
                            timestamp: new Date()
                        });
                    }
                    catch (err) {
                        console.error('Failed to notify n8n for contact', body.contactId, err);
                    }
                }));
                if (b < batches.length - 1)
                    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
            }
        })();
        res.json({ message: 'Campaign launched', queued: toDispatch.length, contactsDispatched: toDispatch.length });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to launch campaign' });
    }
});
// PATCH /api/campaigns/:id/pause (Tenant Admin, Campaign Manager)
router.patch('/:id/pause', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { id } = req.params;
        const campaign = await Campaign_1.Campaign.findOneAndUpdate({ _id: id, companyId }, { $set: { status: 'PAUSED' } }, { new: true });
        if (!campaign) {
            return res.status(404).json({ message: 'Campaign not found' });
        }
        res.json({ campaign });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to pause campaign' });
    }
});
// DELETE /api/campaigns/:id (Tenant Admin, Campaign Manager)
router.delete('/:id', auth_1.authMiddleware, (0, auth_1.requireRoles)('TENANT_ADMIN', 'CAMPAIGN_MANAGER'), async (req, res) => {
    try {
        const companyId = req.companyId;
        const { id } = req.params;
        const campaign = await Campaign_1.Campaign.findById(id);
        if (!campaign) {
            return res.status(404).json({ message: 'Campaign not found' });
        }
        if (campaign.companyId.toString() !== companyId) {
            return res.status(403).json({ message: 'Forbidden: you do not have access to this campaign' });
        }
        await Campaign_1.Campaign.findByIdAndDelete(id);
        await Contact_1.Contact.deleteMany({ campaignId: campaign._id, companyId });
        res.json({ message: 'Campaign deleted' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to delete campaign' });
    }
});
exports.default = router;
