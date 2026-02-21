"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalisePhone = normalisePhone;
/**
 * Normalise phone number for DND matching: remove +91, spaces, dashes
 */
function normalisePhone(phone) {
    if (!phone || typeof phone !== 'string')
        return '';
    return phone
        .replace(/^\+91\s*/i, '')
        .replace(/[\s\-]/g, '')
        .trim();
}
