"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPullSync = runPullSync;
const axios_1 = __importDefault(require("axios"));
const AccountProfile_1 = require("../models/AccountProfile");
const DataSourceConfig_1 = require("../models/DataSourceConfig");
const phoneNormalize_1 = require("../utils/phoneNormalize");
const credentialEncryption_1 = require("./credentialEncryption");
async function runPullSync(companyId) {
    const ds = await DataSourceConfig_1.DataSourceConfig.findOne({ companyId });
    if (!ds || ds.mode !== 'pull' || !ds.pullUrl) {
        return { ok: false, error: 'Pull sync not configured' };
    }
    const mapping = ds.fieldMapping || {};
    const mapField = (row, canonical) => {
        const bankField = mapping[canonical] || canonical;
        return row[bankField] ?? row[canonical];
    };
    const rawAuthConfig = ds.pullAuthConfig;
    const authConfig = rawAuthConfig ? (0, credentialEncryption_1.decryptPullAuthConfig)(rawAuthConfig) : {};
    const authType = ds.pullAuthType || 'api_key';
    const config = {};
    if (authType === 'api_key') {
        config.headers = { [authConfig.headerName || 'X-API-Key']: authConfig.apiKey };
    }
    else if (authType === 'basic') {
        config.auth = { username: authConfig.username || '', password: authConfig.password || '' };
    }
    else if (authType === 'oauth2') {
        config.headers = { Authorization: `Bearer ${authConfig.accessToken}` };
    }
    const lastSync = ds.lastSyncAt;
    const url = new URL(ds.pullUrl);
    if (lastSync && authConfig.lastModifiedParam) {
        url.searchParams.set(authConfig.lastModifiedParam, lastSync.toISOString());
    }
    const resp = await axios_1.default.get(url.toString(), { ...config, timeout: 60000 });
    const rows = Array.isArray(resp.data) ? resp.data : resp.data?.accounts ?? resp.data?.data ?? [];
    if (!Array.isArray(rows)) {
        throw new Error('CBS API must return an array of account objects');
    }
    const now = new Date();
    let created = 0;
    let updated = 0;
    for (const row of rows) {
        const externalId = String(mapField(row, 'externalAccountId') ?? '').trim();
        if (!externalId)
            continue;
        const phoneRaw = String(mapField(row, 'phone') ?? '').trim();
        const phone = phoneRaw ? (0, phoneNormalize_1.normalisePhone)(phoneRaw) : 'uncallable';
        const parseNum = (v) => (typeof v === 'number' ? v : Number(String(v ?? 0).replace(/[^0-9.-]/g, '')) || 0);
        const parseDate = (v) => (!v ? null : new Date(String(v)));
        const doc = {
            companyId,
            externalAccountId: externalId,
            customerName: String(mapField(row, 'customerName') ?? mapField(row, 'name') ?? 'Unknown').trim(),
            phone,
            altPhone: mapField(row, 'altPhone') ? String(mapField(row, 'altPhone')).trim() : undefined,
            email: mapField(row, 'email') ? String(mapField(row, 'email')).trim() : undefined,
            productType: mapField(row, 'productType') ? String(mapField(row, 'productType')).trim() : undefined,
            outstandingAmount: parseNum(mapField(row, 'outstandingAmount')),
            dpd: Math.max(0, Math.floor(parseNum(mapField(row, 'dpd')))),
            dueDate: parseDate(mapField(row, 'dueDate')),
            maturityDate: parseDate(mapField(row, 'maturityDate')),
            kycExpiryDate: parseDate(mapField(row, 'kycExpiryDate')),
            dataFreshnessAt: now
        };
        const existing = await AccountProfile_1.AccountProfile.findOne({ companyId, externalAccountId: externalId });
        if (existing) {
            await AccountProfile_1.AccountProfile.updateOne({ _id: existing._id }, { $set: doc });
            updated++;
        }
        else {
            await AccountProfile_1.AccountProfile.create({ ...doc, status: 'ACTIVE', callCount: 0 });
            created++;
        }
    }
    await DataSourceConfig_1.DataSourceConfig.updateOne({ companyId }, { $set: { lastSyncAt: now, lastSyncStatus: 'success' } });
    return { ok: true, created, updated, total: rows.length };
}
