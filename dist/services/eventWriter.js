"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeCallEvent = writeCallEvent;
const CallEvent_1 = require("../models/CallEvent");
const SYSTEM_EVENTS = ['OFFERING_TOGGLED', 'SYNC_FAILED', 'ACCOUNT_STALE'];
async function writeCallEvent(params) {
    const { accountId, contactId, eventType } = params;
    if (!SYSTEM_EVENTS.includes(eventType) && !accountId && !contactId) {
        throw new Error('CallEvent must have either accountId or contactId (except for system events)');
    }
    await CallEvent_1.CallEvent.create({
        companyId: params.companyId,
        accountId: accountId ?? undefined,
        contactId: contactId ?? undefined,
        campaignId: params.campaignId,
        botConfigId: params.botConfigId,
        offeringId: params.offeringId,
        vapiCallId: params.vapiCallId,
        eventType: params.eventType,
        payload: params.payload,
        source: params.source,
        timestamp: params.timestamp ?? new Date()
    });
}
