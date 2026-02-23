"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const retryScheduler_1 = require("./jobs/retryScheduler");
const ruleEngineScheduler_1 = require("./jobs/ruleEngineScheduler");
const dispatchWorkerScheduler_1 = require("./jobs/dispatchWorkerScheduler");
const pullSyncScheduler_1 = require("./jobs/pullSyncScheduler");
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const mongoose_1 = __importDefault(require("mongoose"));
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const campaigns_1 = __importDefault(require("./routes/campaigns"));
const contacts_1 = __importDefault(require("./routes/contacts"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const settings_1 = __importDefault(require("./routes/settings"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const data_1 = __importDefault(require("./routes/data"));
const accounts_1 = __importDefault(require("./routes/accounts"));
const botconfigs_1 = __importDefault(require("./routes/botconfigs"));
const events_1 = __importDefault(require("./routes/events"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const adminAuth_1 = __importDefault(require("./routes/adminAuth"));
const admin_1 = __importDefault(require("./routes/admin"));
const app = (0, express_1.default)();
const allowedOrigins = [
    'http://localhost:3000',
    'https://callflow-two.vercel.app'
];
app.use((0, cors_1.default)({ origin: allowedOrigins, credentials: true }));
app.use(express_1.default.json({
    verify: (req, _res, buf) => {
        const path = req.originalUrl?.split('?')[0] ?? '';
        if (path.match(/\/api\/data\/tenant\/[^/]+\/accounts$/) && !path.includes('upload')) {
            ;
            req.rawBody = buf;
        }
    }
}));
app.use((0, morgan_1.default)('dev'));
app.use('/api/auth', auth_1.default);
app.use('/api/users', users_1.default);
app.use('/api/campaigns', campaigns_1.default);
app.use('/api/contacts', contacts_1.default);
app.use('/api/webhooks', webhooks_1.default);
app.use('/api/settings', settings_1.default);
app.use('/api/dashboard', dashboard_1.default);
app.use('/api/data', data_1.default);
app.use('/api/accounts', accounts_1.default);
app.use('/api/botconfigs', botconfigs_1.default);
app.use('/api/events', events_1.default);
app.use('/api/analytics', analytics_1.default);
app.use('/api/admin/auth', adminAuth_1.default);
app.use('/api/admin', admin_1.default);
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/callflow';
const PORT = process.env.PORT || 5000;
async function start() {
    try {
        await mongoose_1.default.connect(MONGO_URI);
        console.log('Connected to MongoDB');
        (0, retryScheduler_1.startRetryScheduler)();
        (0, ruleEngineScheduler_1.startRuleEngineScheduler)();
        (0, dispatchWorkerScheduler_1.startDispatchWorker)();
        (0, pullSyncScheduler_1.startPullSyncScheduler)();
        app.get('/health', (_req, res) => {
            res.json({ status: 'ok' });
        });
        app.listen(PORT, () => {
            console.log(`API server listening on port ${PORT}`);
        });
    }
    catch (err) {
        console.error('Failed to start server', err);
        process.exit(1);
    }
}
start();
