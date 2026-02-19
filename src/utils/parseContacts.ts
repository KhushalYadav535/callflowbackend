import XLSX from 'xlsx'

export type ParsedContactRow = {
  name: string
  phone: string
  amount: number
  dueDate: Date | null
  loanType: string
  email: string
  city: string
}

export function parseContactsFromBuffer(buffer: Buffer): ParsedContactRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []

  const sheet = workbook.Sheets[sheetName]
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  if (!rows.length) {
    return []
  }

  const normalize = (key: string) =>
    key.replace(/\s+/g, '').replace(/_/g, '').toLowerCase()

  const headerMap = Object.keys(rows[0]).reduce<Record<string, string>>((acc, key) => {
    acc[normalize(key)] = key
    return acc
  }, {})

  const getKey = (alts: string[]): string | null => {
    for (const alt of alts) {
      const norm = normalize(alt)
      if (headerMap[norm]) return headerMap[norm]
    }
    return null
  }

  const nameKey = getKey(['name', 'full name'])
  const phoneKey = getKey(['phone', 'phone number', 'mobile'])
  const amountKey = getKey(['amount', 'loan amount'])
  const dueDateKey = getKey(['duedate', 'due date'])
  const loanTypeKey = getKey(['loantype', 'loan type'])
  const emailKey = getKey(['email', 'email address'])
  const cityKey = getKey(['city'])

  if (!nameKey || !phoneKey || !amountKey || !dueDateKey || !loanTypeKey || !emailKey || !cityKey) {
    throw new Error(
      'Missing required columns. Expected: name, phone, amount, dueDate, loanType, email, city'
    )
  }

  const parseAmount = (value: any): number => {
    if (typeof value === 'number') return value
    const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '')
    const num = Number(cleaned)
    return Number.isNaN(num) ? 0 : num
  }

  const parseDate = (value: any): Date | null => {
    if (!value) return null
    if (value instanceof Date) return value
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  return rows
    .map((row) => ({
      name: String(row[nameKey] ?? '').trim(),
      phone: String(row[phoneKey] ?? '').trim(),
      amount: parseAmount(row[amountKey]),
      dueDate: parseDate(row[dueDateKey]),
      loanType: String(row[loanTypeKey] ?? '').trim(),
      email: String(row[emailKey] ?? '').trim(),
      city: String(row[cityKey] ?? '').trim()
    }))
    .filter((row) => row.name || row.phone)
}

