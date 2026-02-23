import XLSX from 'xlsx'
import { normalisePhone } from './phoneNormalize'

export type ParsedAccountRow = {
  externalAccountId: string
  customerName: string
  phone: string
  altPhone?: string
  email?: string
  language?: string
  productType?: string
  outstandingAmount: number
  dpd: number
  dueDate: Date | null
  maturityDate: Date | null
  kycExpiryDate: Date | null
}

const EXTERNAL_ID_ALIASES = [
  'loan account no', 'loanaccountno', 'account no', 'accountno',
  'account number', 'accountnumber', 'externalaccountid', 'external account id'
]

const NAME_ALIASES = ['name', 'full name', 'fullname', 'customer name', 'customername', 'borrower name', 'borrowername']

const PHONE_ALIASES = ['phone', 'phone number', 'mobile', 'mobileno', 'cell', 'contact number', 'whatsapp']

const AMOUNT_ALIASES = ['amount', 'outstanding', 'outstanding amount', 'outstandingamount', 'loan amount', 'due amount']

const DPD_ALIASES = ['dpd', 'days past due', 'dayspastdue']

const DUE_DATE_ALIASES = ['duedate', 'due date', 'payment due', 'last payment date']

const MATURITY_ALIASES = ['maturitydate', 'maturity date']

const KYC_ALIASES = ['kycexpirydate', 'kyc expiry', 'kycexpiry']

const PRODUCT_ALIASES = ['producttype', 'product type', 'product', 'loan type', 'loantype']

export function parseAccountsFromBuffer(buffer: Buffer): ParsedAccountRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []

  const sheet = workbook.Sheets[sheetName]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  if (!rows.length) return []

  const normalize = (key: string) =>
    String(key)
      .replace(/\s+/g, '')
      .replace(/_/g, '')
      .toLowerCase()

  const headerMap = Object.keys(rows[0]).reduce<Record<string, string>>((acc, key) => {
    acc[normalize(String(key))] = String(key)
    return acc
  }, {})

  const getKey = (alts: string[]): string | null => {
    for (const alt of alts) {
      const norm = normalize(alt)
      if (headerMap[norm]) return headerMap[norm]
    }
    return null
  }

  const externalIdKey = getKey(EXTERNAL_ID_ALIASES)
  const nameKey = getKey(NAME_ALIASES)
  const phoneKey = getKey(PHONE_ALIASES)
  const amountKey = getKey(AMOUNT_ALIASES)
  const dpdKey = getKey(DPD_ALIASES)
  const dueDateKey = getKey(DUE_DATE_ALIASES)
  const maturityKey = getKey(MATURITY_ALIASES)
  const kycKey = getKey(KYC_ALIASES)
  const productKey = getKey(PRODUCT_ALIASES)
  const altPhoneKey = getKey(['alt phone', 'alternate phone', 'secondary phone'])
  const emailKey = getKey(['email', 'email address', 'emailid'])

  if (!externalIdKey) {
    throw new Error('Missing required column for account identifier. Expected: Loan Account No, Account Number, or similar')
  }

  if (!nameKey) {
    throw new Error('Missing required column: Customer Name or similar')
  }

  const parseAmount = (value: unknown): number => {
    if (typeof value === 'number') return value
    const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '')
    const num = Number(cleaned)
    return Number.isNaN(num) ? 0 : num
  }

  const parseDate = (value: unknown): Date | null => {
    if (!value) return null
    if (value instanceof Date) return value
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? null : date
  }

  const result: ParsedAccountRow[] = []
  for (const row of rows) {
    const externalId = String(externalIdKey ? row[externalIdKey] : '').trim()
    if (!externalId) continue

    const phoneRaw = String(phoneKey ? row[phoneKey] : '').trim()
    const phone = phoneRaw ? normalisePhone(phoneRaw) : ''

    result.push({
      externalAccountId: externalId,
      customerName: String(nameKey ? row[nameKey] : '').trim() || 'Unknown',
      phone,
      altPhone: altPhoneKey && row[altPhoneKey] ? String(row[altPhoneKey]).trim() : undefined,
      email: emailKey && row[emailKey] ? String(row[emailKey]).trim() : undefined,
      language: 'hi-IN',
      productType: productKey && row[productKey] ? String(row[productKey]).trim() : undefined,
      outstandingAmount: parseAmount(amountKey ? row[amountKey] : 0),
      dpd: Math.max(0, Math.floor(parseAmount(dpdKey ? row[dpdKey] : 0))),
      dueDate: parseDate(dueDateKey ? row[dueDateKey] : null),
      maturityDate: parseDate(maturityKey ? row[maturityKey] : null),
      kycExpiryDate: parseDate(kycKey ? row[kycKey] : null)
    })
  }
  return result
}
