"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const auth_1 = require("../middleware/auth");
const CallLog_1 = require("../models/CallLog");
const Contact_1 = require("../models/Contact");
const AccountProfile_1 = require("../models/AccountProfile");
const router = (0, express_1.Router)();
// GET /api/dashboard/stats
router.get('/stats', auth_1.authMiddleware, async (req, res) => {
    try {
        const companyId = req.companyId;
        const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
        const [totalCallsResult, connectedResult, promiseToPayResult, paidResult, accountCount] = await Promise.all([
            CallLog_1.CallLog.countDocuments({ companyId: companyObjectId }),
            CallLog_1.CallLog.countDocuments({ companyId: companyObjectId, outcome: 'connected' }),
            Contact_1.Contact.countDocuments({ companyId: companyObjectId, paymentDisposition: 'promise_to_pay' }),
            Contact_1.Contact.countDocuments({ companyId: companyObjectId, paymentDisposition: 'paid' }),
            AccountProfile_1.AccountProfile.countDocuments({ companyId: companyObjectId })
        ]);
        const totalCallsMade = totalCallsResult;
        const callsConnected = connectedResult;
        const promiseToPayCount = promiseToPayResult;
        const paidCount = paidResult;
        const connectRate = totalCallsMade > 0 ? Math.round((callsConnected / totalCallsMade) * 1000) / 10 : 0;
        res.json({
            totalCallsMade,
            callsConnected,
            promiseToPayCount,
            paidCount,
            connectRate,
            accountCount
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load dashboard stats' });
    }
});
exports.default = router;
