"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPullSyncScheduler = startPullSyncScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const cron_parser_1 = __importDefault(require("cron-parser"));
const DataSourceConfig_1 = require("../models/DataSourceConfig");
const pullSyncService_1 = require("../services/pullSyncService");
const eventWriter_1 = require("../services/eventWriter");
const CHECK_INTERVAL_MIN = Number(process.env.PULL_SYNC_CHECK_INTERVAL_MINUTES) || 5;
function startPullSyncScheduler() {
    const cronExpr = `*/${CHECK_INTERVAL_MIN} * * * *`;
    node_cron_1.default.schedule(cronExpr, async () => {
        try {
            const configs = await DataSourceConfig_1.DataSourceConfig.find({
                mode: 'pull',
                pullUrl: { $exists: true, $nin: [null, ''] },
                pullScheduleCron: { $exists: true, $nin: [null, ''] }
            }).lean();
            const now = new Date();
            const graceMs = Math.min(CHECK_INTERVAL_MIN * 60 * 1000, 5 * 60 * 1000);
            for (const ds of configs) {
                const cronExpr = ds.pullScheduleCron;
                const companyId = ds.companyId;
                if (!cronExpr || !companyId)
                    continue;
                try {
                    const interval = cron_parser_1.default.parse(cronExpr);
                    const prevDate = interval.prev();
                    const prev = typeof prevDate?.toDate === 'function' ? prevDate.toDate() : new Date(prevDate);
                    const timeSincePrev = now.getTime() - prev.getTime();
                    if (timeSincePrev > graceMs || timeSincePrev < 0)
                        continue;
                    // Avoid running twice in same cycle
                    const lastSync = ds.lastSyncAt;
                    if (lastSync && lastSync.getTime() >= prev.getTime())
                        continue;
                    const result = await (0, pullSyncService_1.runPullSync)(companyId);
                    if (result.ok) {
                        console.log(`[CF2-PullSync] ${companyId}: ${result.created} created, ${result.updated} updated`);
                    }
                }
                catch (err) {
                    console.error(`[CF2-PullSync] ${companyId} error:`, err);
                    await (0, eventWriter_1.writeCallEvent)({
                        companyId,
                        eventType: 'SYNC_FAILED',
                        payload: { mode: 'pull', errorMessage: err instanceof Error ? err.message : 'Unknown error' },
                        source: 'system',
                        timestamp: new Date()
                    }).catch(() => { });
                }
            }
        }
        catch (err) {
            console.error('[CF2-PullSync] Scheduler error:', err);
        }
    });
    console.log(`[CF2-PullSync] Scheduler running every ${CHECK_INTERVAL_MIN} minutes`);
}
