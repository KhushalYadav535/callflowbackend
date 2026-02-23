/**
 * Seed V2 Platform Offerings and BotConfig templates
 * Run: npx ts-node scripts/seed-v2.ts
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { PlatformOffering } from '../src/models/PlatformOffering'
import { BotConfig } from '../src/models/BotConfig'

const OFFERINGS = [
  {
    offeringId: 'reminder-bot',
    name: 'Reminder Bot',
    description: 'Proactively reminds customers of upcoming payment due dates',
    isAvailable: true,
    version: '1.0.0',
    capabilities: ['callbackScheduling'],
    requiredDataFields: ['phone', 'dueDate', 'dpd', 'outstandingAmount', 'customerName']
  },
  {
    offeringId: 'recovery-bot',
    name: 'Recovery Bot',
    description: 'Contacts delinquent accounts for payment commitments',
    isAvailable: true,
    version: '1.0.0',
    capabilities: ['ptpCapture', 'settlementNegotiation', 'legalNotice'],
    requiredDataFields: ['phone', 'dpd', 'outstandingAmount', 'dueDate', 'productType', 'customerName']
  },
  {
    offeringId: 'sales-bot',
    name: 'Sales Bot',
    description: 'Cross-sells to existing customers',
    isAvailable: true,
    version: '1.0.0',
    capabilities: ['leadCapture', 'coolingOff'],
    requiredDataFields: ['phone', 'customerName']
  },
  {
    offeringId: 'maturity-bot',
    name: 'Maturity Bot',
    description: 'Contacts customers approaching loan/deposit maturity',
    isAvailable: true,
    version: '1.0.0',
    capabilities: ['callbackScheduling'],
    requiredDataFields: ['phone', 'maturityDate', 'productType', 'outstandingAmount', 'customerName']
  },
  {
    offeringId: 'kyc-bot',
    name: 'KYC Bot',
    description: 'Contacts customers with expiring KYC documents',
    isAvailable: true,
    version: '1.0.0',
    capabilities: [],
    requiredDataFields: ['phone', 'kycExpiryDate', 'customerName', 'productType']
  }
]

const TEMPLATES = [
  {
    name: 'TPL-REM-001: Reminder Bot Standard',
    offeringId: 'reminder-bot',
    isTemplate: true,
    isActive: true,
    trigger: {
      conditions: [
        { field: 'dpd', operator: 'eq', value: 0 },
        { field: 'dueDate', operator: 'within_days', value: 7 }
      ]
    },
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
  {
    name: 'TPL-REC-001: Recovery Bot Standard',
    offeringId: 'recovery-bot',
    isTemplate: true,
    isActive: true,
    trigger: {
      conditions: [
        { field: 'dpd', operator: 'gte', value: 1 }
      ]
    },
    script: { voice: 'sonia', language: 'hi-IN', promptTemplate: 'Recovery: Your overdue amount {{amount}} is past due. Please make payment.' },
    dispositions: [
      { value: 'paid', label: 'Paid', action: 'set_account_completed', terminal: true },
      { value: 'promise_to_pay', label: 'Promise to Pay', action: 'capture_ptp_date', terminal: false },
      { value: 'dispute', label: 'Dispute', action: 'escalate_to_agent', terminal: false },
      { value: 'not_reachable', label: 'Not Reachable', action: 'retry', terminal: false }
    ],
    retryRules: { maxAttempts: 5, intervalHours: 8 },
    compliance: { callingWindow: { start: '08:00', end: '19:00' }, timezone: 'Asia/Kolkata', dndCheck: true, maxAttemptsPerDay: 3 }
  },
  {
    name: 'TPL-REC-002: Recovery Bot NPA (DPD 90+)',
    offeringId: 'recovery-bot',
    isTemplate: true,
    isActive: true,
    trigger: {
      conditions: [
        { field: 'dpd', operator: 'gte', value: 90 }
      ]
    },
    script: { voice: 'sonia', language: 'hi-IN', promptTemplate: 'NPA Recovery: Your account is severely overdue. Please contact us for settlement options.' },
    dispositions: [
      { value: 'paid', label: 'Paid', action: 'set_account_completed', terminal: true },
      { value: 'settlement_agreed', label: 'Settlement Agreed', action: 'escalate_for_approval', terminal: false },
      { value: 'legal_notice_consented', label: 'Legal Notice Consented', action: 'escalate_legal', terminal: false },
      { value: 'dispute', label: 'Dispute', action: 'escalate_to_agent', terminal: false },
      { value: 'not_reachable', label: 'Not Reachable', action: 'retry', terminal: false }
    ],
    retryRules: { maxAttempts: 5, intervalHours: 24 },
    compliance: { callingWindow: { start: '08:00', end: '19:00' }, timezone: 'Asia/Kolkata', dndCheck: true, maxAttemptsPerDay: 3 }
  },
  {
    name: 'TPL-SAL-001: Sales Bot Standard',
    offeringId: 'sales-bot',
    isTemplate: true,
    isActive: true,
    trigger: {
      conditions: [
        { field: 'dpd', operator: 'eq', value: 0 }
      ]
    },
    script: { voice: 'sonia', language: 'hi-IN', promptTemplate: 'Hi, we have exclusive offers for our valued customers. Would you like to hear about our latest products?' },
    dispositions: [
      { value: 'interested', label: 'Interested', action: 'create_lead_in_crm', terminal: true },
      { value: 'not_interested', label: 'Not Interested', action: 'close_with_cooling_off', terminal: true },
      { value: 'callback_requested', label: 'Wants Callback', action: 'schedule_callback', terminal: false },
      { value: 'already_has_product', label: 'Already Has Product', action: 'close_cycle', terminal: true },
      { value: 'not_reachable', label: 'Not Reachable', action: 'retry', terminal: false }
    ],
    retryRules: { maxAttempts: 3, intervalHours: 168 },
    compliance: { callingWindow: { start: '09:00', end: '19:00' }, timezone: 'Asia/Kolkata', dndCheck: true, maxAttemptsPerDay: 1 }
  },
  {
    name: 'TPL-MAT-001: Maturity Bot Standard',
    offeringId: 'maturity-bot',
    isTemplate: true,
    isActive: true,
    trigger: {
      conditions: [
        { field: 'maturityDate', operator: 'within_days', value: 30 }
      ]
    },
    script: { voice: 'sonia', language: 'hi-IN', promptTemplate: 'Your loan/deposit matures soon. Would you like to renew or close?' },
    dispositions: [
      { value: 'wants_renewal', label: 'Wants Renewal', action: 'create_renewal_lead', terminal: true },
      { value: 'wants_closure', label: 'Wants Closure', action: 'flag_for_noc', terminal: true },
      { value: 'needs_more_info', label: 'Needs More Information', action: 'escalate_to_agent', terminal: false },
      { value: 'callback_requested', label: 'Wants Callback', action: 'schedule_callback', terminal: false },
      { value: 'not_reachable', label: 'Not Reachable', action: 'retry', terminal: false }
    ],
    retryRules: { maxAttempts: 4, intervalHours: 24 },
    compliance: { callingWindow: { start: '09:00', end: '19:00' }, timezone: 'Asia/Kolkata', dndCheck: true, maxAttemptsPerDay: 2 }
  },
  {
    name: 'TPL-KYC-001: KYC Bot Standard',
    offeringId: 'kyc-bot',
    isTemplate: true,
    isActive: true,
    trigger: {
      conditions: [
        { field: 'kycExpiryDate', operator: 'within_days', value: 30 }
      ]
    },
    script: { voice: 'sonia', language: 'hi-IN', promptTemplate: 'Your KYC documents are expiring soon. Please update via branch visit, doorstep, or digital upload.' },
    dispositions: [
      { value: 'will_visit_branch', label: 'Will Visit Branch', action: 'send_branch_confirmation', terminal: true },
      { value: 'needs_doorstep', label: 'Needs Doorstep Service', action: 'escalate_to_field_agent', terminal: true },
      { value: 'will_do_digital', label: 'Will Do Digital KYC', action: 'send_digital_link', terminal: true },
      { value: 'not_reachable', label: 'Not Reachable', action: 'retry', terminal: false },
      { value: 'documents_not_ready', label: 'Documents Not Ready', action: 'retry_in_days', terminal: false }
    ],
    retryRules: { maxAttempts: 5, intervalHours: 48 },
    compliance: { callingWindow: { start: '09:00', end: '19:00' }, timezone: 'Asia/Kolkata', dndCheck: true, maxAttemptsPerDay: 2 }
  }
]

async function seed() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/callflow'
  await mongoose.connect(uri)
  console.log('Connected to MongoDB')

  for (const o of OFFERINGS) {
    await PlatformOffering.findOneAndUpdate(
      { offeringId: o.offeringId },
      { $set: o },
      { upsert: true }
    )
    console.log(`  PlatformOffering: ${o.offeringId}`)
  }

  for (const t of TEMPLATES) {
    const existing = await BotConfig.findOne({
      name: t.name,
      isTemplate: true
    })
    if (!existing) {
      await BotConfig.create({ ...t, companyId: null })
      console.log(`  BotConfig template: ${t.name}`)
    }
  }

  console.log('V2 seed complete.')
  process.exit(0)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
