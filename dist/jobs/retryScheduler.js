"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRetryScheduler = startRetryScheduler;
const axios_1 = __importDefault(require("axios"));
const Contact_1 = require("../models/Contact");
const Campaign_1 = require("../models/Campaign");
const Company_1 = require("../models/Company");
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
async function runRetryDispatch() {
    try {
        const now = new Date();
        const dueContacts = await Contact_1.Contact.find({
            callStatus: 'NOT_ANSWERED',
            nextRetryAt: { $lte: now, $ne: null },
            campaignId: { $exists: true }
        })
            .populate('campaignId')
            .limit(200)
            .lean();
        if (dueContacts.length === 0)
            return;
        const byCampaign = new Map();
        for (const c of dueContacts) {
            const cid = c.campaignId?._id?.toString();
            if (cid) {
                if (!byCampaign.has(cid))
                    byCampaign.set(cid, []);
                byCampaign.get(cid).push(c);
            }
        }
        for (const [campaignIdStr, contacts] of byCampaign) {
            const campaign = await Campaign_1.Campaign.findById(campaignIdStr);
            if (!campaign || campaign.status !== 'ACTIVE')
                continue;
            const company = await Company_1.Company.findById(campaign.companyId).select('n8nWebhookUrl');
            const n8nUrl = company?.n8nWebhookUrl || process.env.N8N_WEBHOOK_URL;
            if (!n8nUrl)
                continue;
            const payloads = contacts.map((c) => ({
                contactId: c._id,
                campaignId: campaign._id,
                companyId: c.companyId,
                name: c.name,
                phone: c.phone,
                amount: c.amount,
                dueDate: c.dueDate,
                loanType: c.loanType,
                email: c.email,
                city: c.city,
                maxRetries: campaign.maxRetries,
                retryAfterHours: campaign.retryAfterHours,
                campaignType: campaign.type,
                voice: campaign.voice,
                language: campaign.language
            }));
            const batches = [];
            for (let i = 0; i < payloads.length; i += BATCH_SIZE)
                batches.push(payloads.slice(i, i + BATCH_SIZE));
            for (let b = 0; b < batches.length; b++) {
                await Promise.all(batches[b].map((body) => axios_1.default.post(n8nUrl, body).catch((err) => console.error('Retry scheduler: failed n8n for', body.contactId, err))));
                await Contact_1.Contact.updateMany({ _id: { $in: batches[b].map((p) => p.contactId) } }, { $set: { callStatus: 'CALLING' } });
                if (b < batches.length - 1)
                    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
            }
        }
    }
    catch (err) {
        console.error('Retry scheduler error:', err);
    }
}
function startRetryScheduler() {
    runRetryDispatch();
    setInterval(runRetryDispatch, INTERVAL_MS);
    console.log('Retry scheduler started (interval:', INTERVAL_MS / 1000, 's)');
}
