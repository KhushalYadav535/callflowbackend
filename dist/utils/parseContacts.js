"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseContactsFromBuffer = parseContactsFromBuffer;
const xlsx_1 = __importDefault(require("xlsx"));
function parseContactsFromBuffer(buffer) {
    const workbook = xlsx_1.default.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName)
        return [];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx_1.default.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) {
        return [];
    }
    const normalize = (key) => key.replace(/\s+/g, '').replace(/_/g, '').toLowerCase();
    const headerMap = Object.keys(rows[0]).reduce((acc, key) => {
        acc[normalize(key)] = key;
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
    const nameKey = getKey(['name', 'full name', 'fullname', 'customer name', 'customername', 'borrower name', 'borrowername']);
    const phoneKey = getKey(['phone', 'phone number', 'mobile', 'mobileno', 'cell', 'cellphone', 'contact number', 'contactnumber', 'whatsapp']);
    const amountKey = getKey(['amount', 'loan amount', 'loanamount', 'outstanding', 'due amount']);
    const dueDateKey = getKey(['duedate', 'due date', 'payment due', 'last payment date']);
    const loanTypeKey = getKey(['loantype', 'loan type', 'product', 'product type']);
    const emailKey = getKey(['email', 'email address', 'emailid', 'e-mail']);
    const cityKey = getKey(['city', 'location', 'branch']);
    if (!nameKey || !phoneKey || !amountKey || !dueDateKey || !loanTypeKey || !emailKey || !cityKey) {
        throw new Error('Missing required columns. Expected: name, phone, amount, dueDate, loanType, email, city');
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
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    };
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
        .filter((row) => row.name || row.phone);
}
