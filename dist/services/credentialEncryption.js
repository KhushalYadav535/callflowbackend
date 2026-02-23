"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptPullAuthConfig = encryptPullAuthConfig;
exports.decryptPullAuthConfig = decryptPullAuthConfig;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
function getKey() {
    const secret = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (!secret)
        return null;
    return crypto_1.default.scryptSync(secret, 'salt', KEY_LENGTH);
}
function encryptPullAuthConfig(obj) {
    const key = getKey();
    if (!key)
        return obj;
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, tag, enc]);
    return { _enc: combined.toString('base64') };
}
function decryptPullAuthConfig(stored) {
    if (!stored || typeof stored !== 'object')
        return {};
    const enc = stored._enc;
    if (typeof enc !== 'string')
        return stored;
    const key = getKey();
    if (!key)
        return {};
    try {
        const buf = Buffer.from(enc, 'base64');
        const iv = buf.subarray(0, IV_LENGTH);
        const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
        const data = buf.subarray(IV_LENGTH + TAG_LENGTH);
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        const dec = decipher.update(data) + decipher.final('utf8');
        return JSON.parse(dec);
    }
    catch {
        return {};
    }
}
