import mongoose from 'mongoose'
import { CallEvent, CallEventType, EventSource } from '../models/CallEvent'

export interface WriteEventParams {
  companyId: mongoose.Types.ObjectId
  eventType: CallEventType
  payload: Record<string, unknown>
  source: EventSource
  timestamp?: Date
  accountId?: mongoose.Types.ObjectId | null
  contactId?: mongoose.Types.ObjectId | null
  campaignId?: mongoose.Types.ObjectId | null
  botConfigId?: mongoose.Types.ObjectId | null
  offeringId?: string | null
  vapiCallId?: string | null
}

const SYSTEM_EVENTS = ['OFFERING_TOGGLED', 'SYNC_FAILED', 'ACCOUNT_STALE']

export async function writeCallEvent(params: WriteEventParams): Promise<void> {
  const { accountId, contactId, eventType } = params
  if (!SYSTEM_EVENTS.includes(eventType) && !accountId && !contactId) {
    throw new Error('CallEvent must have either accountId or contactId (except for system events)')
  }

  await CallEvent.create({
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
  })
}
