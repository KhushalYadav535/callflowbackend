import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16
const KEY_LENGTH = 32

function getKey(): Buffer | null {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY
  if (!secret) return null
  return crypto.scryptSync(secret, 'salt', KEY_LENGTH)
}

export function encryptPullAuthConfig(obj: Record<string, string>): Record<string, unknown> {
  const key = getKey()
  if (!key) return obj as unknown as Record<string, unknown>
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const combined = Buffer.concat([iv, tag, enc])
  return { _enc: combined.toString('base64') }
}

export function decryptPullAuthConfig(stored: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!stored || typeof stored !== 'object') return {}
  const enc = stored._enc
  if (typeof enc !== 'string') return stored as unknown as Record<string, string>
  const key = getKey()
  if (!key) return {}
  try {
    const buf = Buffer.from(enc, 'base64')
    const iv = buf.subarray(0, IV_LENGTH)
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
    const data = buf.subarray(IV_LENGTH + TAG_LENGTH)
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    const dec = decipher.update(data) + decipher.final('utf8')
    return JSON.parse(dec) as Record<string, string>
  } catch {
    return {}
  }
}
