/**
 * Normalise phone number for DND matching: remove +91, spaces, dashes
 */
export function normalisePhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return ''
  return phone
    .replace(/^\+91\s*/i, '')
    .replace(/[\s\-]/g, '')
    .trim()
}
