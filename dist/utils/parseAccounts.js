"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAccountsFromBuffer = parseAccountsFromBuffer;
const xlsx_1 = __importDefault(require("xlsx"));
const phoneNormalize_1 = require("./phoneNormalize");
const EXTERNAL_ID_ALIASES = [
    'loan account no', 'loanaccountno', 'account no', 'accountno',
    'account number', 'accountnumber', 'externalaccountid', 'external account id'
];
const NAME_ALIASES = ['name', 'full name', 'fullname', 'customer name', 'customername', 'borrower name', 'borrowername'];
const PHONE_ALIASES = ['phone', 'phone number', 'mobile', 'mobileno', 'cell', 'contact number', 'whatsapp'];
const AMOUNT_ALIASES = ['amount', 'outstanding', 'outstanding amount', 'outstandingamount', 'loan amount', 'due amount'];
const DPD_ALIASES = ['dpd', 'days past due', 'dayspastdue'];
const DUE_DATE_ALIASES = ['duedate', 'due date', 'payment due', 'last payment date'];
const MATURITY_ALIASES = ['maturitydate', 'maturity date'];
const KYC_ALIASES = ['kycexpirydate', 'kyc expiry', 'kycexpiry'];
const PRODUCT_ALIASES = ['producttype', 'product type', 'product', 'loan type', 'loantype'];
function parseAccountsFromBuffer(buffer) {
    const workbook = xlsx_1.default.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName)
        return [];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx_1.default.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length)
        return [];
    const normalize = (key) => String(key)
        .replace(/\s+/g, '')
        .replace(/_/g, '')
        .toLowerCase();
    const headerMap = Object.keys(rows[0]).reduce((acc, key) => {
        acc[normalize(String(key))] = String(key);
        return acc;
    }, {});
    const getKey = (alts) => {
        for (const alt of alts) {
            const norm = normalize(alt);
            if (headerMap[norm])
                return headerMap[norm];
        }
        return null;
    };
    const externalIdKey = getKey(EXTERNAL_ID_ALIASES);
    const nameKey = getKey(NAME_ALIASES);
    const phoneKey = getKey(PHONE_ALIASES);
    const amountKey = getKey(AMOUNT_ALIASES);
    const dpdKey = getKey(DPD_ALIASES);
    const dueDateKey = getKey(DUE_DATE_ALIASES);
    const maturityKey = getKey(MATURITY_ALIASES);
    const kycKey = getKey(KYC_ALIASES);
    const productKey = getKey(PRODUCT_ALIASES);
    const altPhoneKey = getKey(['alt phone', 'alternate phone', 'secondary phone']);
    const emailKey = getKey(['email', 'email address', 'emailid']);
    if (!externalIdKey) {
        throw new Error('Missing required column for account identifier. Expected: Loan Account No, Account Number, or similar');
    }
    if (!nameKey) {
        throw new Error('Missing required column: Customer Name or similar');
    }
    const parseAmount = (value) => {
        if (typeof value === 'number')
            return value;
        const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
        const num = Number(cleaned);
        return Number.isNaN(num) ? 0 : num;
    };
    const parseDate = (value) => {
        if (!value)
            return null;
        if (value instanceof Date)
            return value;
        const date = new Date(String(value));
        return Number.isNaN(date.getTime()) ? null : date;
    };
    const result = [];
    for (const row of rows) {
        const externalId = String(externalIdKey ? row[externalIdKey] : '').trim();
        if (!externalId)
            continue;
        const phoneRaw = String(phoneKey ? row[phoneKey] : '').trim();
        const phone = phoneRaw ? (0, phoneNormalize_1.normalisePhone)(phoneRaw) : '';
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
        });
    }
    return result;
}
