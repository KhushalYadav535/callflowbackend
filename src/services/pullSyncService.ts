import axios from 'axios'
import mongoose from 'mongoose'
import { AccountProfile } from '../models/AccountProfile'
import { DataSourceConfig } from '../models/DataSourceConfig'
import { writeCallEvent } from './eventWriter'
import { normalisePhone } from '../utils/phoneNormalize'
import { decryptPullAuthConfig, encryptPullAuthConfig } from './credentialEncryption'

export type PullSyncResult = { ok: true; created: number; updated: number; total: number } | { ok: false; error: string }

export async function runPullSync(companyId: mongoose.Types.ObjectId): Promise<PullSyncResult> {
  const ds = await DataSourceConfig.findOne({ companyId })
  if (!ds || ds.mode !== 'pull' || !ds.pullUrl) {
    return { ok: false, error: 'Pull sync not configured' }
  }
  const mapping = ds.fieldMapping || {}
  const mapField = (row: Record<string, unknown>, canonical: string): unknown => {
    const bankField = mapping[canonical] || canonical
    return row[bankField] ?? row[canonical]
  }
  const rawAuthConfig = ds.pullAuthConfig
  const authConfig = rawAuthConfig ? decryptPullAuthConfig(rawAuthConfig) : {}
  const authType = ds.pullAuthType || 'api_key'
  const config: Record<string, unknown> = {}
  if (authType === 'api_key') {
    config.headers = { [authConfig.headerName || 'X-API-Key']: authConfig.apiKey }
  } else if (authType === 'basic') {
    config.auth = { username: authConfig.username || '', password: authConfig.password || '' }
  } else if (authType === 'oauth2') {
    config.headers = { Authorization: `Bearer ${authConfig.accessToken}` }
  }
  const lastSync = ds.lastSyncAt
  const url = new URL(ds.pullUrl)
  if (lastSync && authConfig.lastModifiedParam) {
    url.searchParams.set(authConfig.lastModifiedParam, lastSync.toISOString())
  }
  const resp = await axios.get(url.toString(), { ...config, timeout: 60000 })
  const rows = Array.isArray(resp.data) ? resp.data : resp.data?.accounts ?? resp.data?.data ?? []
  if (!Array.isArray(rows)) {
    throw new Error('CBS API must return an array of account objects')
  }
  const now = new Date()
  let created = 0
  let updated = 0
  for (const row of rows) {
    const externalId = String(mapField(row as Record<string, unknown>, 'externalAccountId') ?? '').trim()
    if (!externalId) continue
    const phoneRaw = String(mapField(row as Record<string, unknown>, 'phone') ?? '').trim()
    const phone = phoneRaw ? normalisePhone(phoneRaw) : 'uncallable'
    const parseNum = (v: unknown) => (typeof v === 'number' ? v : Number(String(v ?? 0).replace(/[^0-9.-]/g, '')) || 0)
    const parseDate = (v: unknown) => (!v ? null : new Date(String(v)))
    const doc = {
      companyId,
      externalAccountId: externalId,
      customerName: String(mapField(row as Record<string, unknown>, 'customerName') ?? mapField(row as Record<string, unknown>, 'name') ?? 'Unknown').trim(),
      phone,
      altPhone: mapField(row as Record<string, unknown>, 'altPhone') ? String(mapField(row as Record<string, unknown>, 'altPhone')).trim() : undefined,
      email: mapField(row as Record<string, unknown>, 'email') ? String(mapField(row as Record<string, unknown>, 'email')).trim() : undefined,
      productType: mapField(row as Record<string, unknown>, 'productType') ? String(mapField(row as Record<string, unknown>, 'productType')).trim() : undefined,
      outstandingAmount: parseNum(mapField(row as Record<string, unknown>, 'outstandingAmount')),
      dpd: Math.max(0, Math.floor(parseNum(mapField(row as Record<string, unknown>, 'dpd')))),
      dueDate: parseDate(mapField(row as Record<string, unknown>, 'dueDate')),
      maturityDate: parseDate(mapField(row as Record<string, unknown>, 'maturityDate')),
      kycExpiryDate: parseDate(mapField(row as Record<string, unknown>, 'kycExpiryDate')),
      dataFreshnessAt: now
    }
    const existing = await AccountProfile.findOne({ companyId, externalAccountId: externalId })
    if (existing) {
      await AccountProfile.updateOne({ _id: existing._id }, { $set: doc })
      updated++
    } else {
      await AccountProfile.create({ ...doc, status: 'ACTIVE', callCount: 0 })
      created++
    }
  }
  await DataSourceConfig.updateOne(
    { companyId },
    { $set: { lastSyncAt: now, lastSyncStatus: 'success' } }
  )
  return { ok: true, created, updated, total: rows.length }
}
