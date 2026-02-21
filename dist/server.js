"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const retryScheduler_1 = require("./jobs/retryScheduler");
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
const app = (0, express_1.default)();
const allowedOrigins = [
    'http://localhost:3000',
    'https://callflow-two.vercel.app'
];
app.use((0, cors_1.default)({ origin: allowedOrigins, credentials: true }));
app.use(express_1.default.json());
app.use((0, morgan_1.default)('dev'));
app.use('/api/auth', auth_1.default);
app.use('/api/users', users_1.default);
app.use('/api/campaigns', campaigns_1.default);
app.use('/api/contacts', contacts_1.default);
app.use('/api/webhooks', webhooks_1.default);
app.use('/api/settings', settings_1.default);
app.use('/api/dashboard', dashboard_1.default);
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/callflow';
const PORT = process.env.PORT || 5000;
async function start() {
    try {
        await mongoose_1.default.connect(MONGO_URI);
        console.log('Connected to MongoDB');
        (0, retryScheduler_1.startRetryScheduler)();
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
