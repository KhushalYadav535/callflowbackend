"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDispatchWorker = startDispatchWorker;
const node_cron_1 = __importDefault(require("node-cron"));
const dispatchWorker_1 = require("./dispatchWorker");
const DISPATCH_INTERVAL_MIN = Number(process.env.DISPATCH_WORKER_INTERVAL_MINUTES) || 5;
function startDispatchWorker() {
    const cronExpr = `*/${DISPATCH_INTERVAL_MIN} * * * *`;
    node_cron_1.default.schedule(cronExpr, async () => {
        try {
            const result = await (0, dispatchWorker_1.runDispatchCycle)();
            if (result.dispatched > 0 || result.failed > 0) {
                console.log(`[CF2-DispatchWorker] Cycle: dispatched=${result.dispatched}, failed=${result.failed}`);
            }
        }
        catch (err) {
            console.error('[CF2-DispatchWorker] Error:', err);
        }
    });
    console.log(`[CF2-DispatchWorker] Scheduled every ${DISPATCH_INTERVAL_MIN} minutes`);
}
