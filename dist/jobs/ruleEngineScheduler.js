"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRuleEngineScheduler = startRuleEngineScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const ruleEngine_1 = require("../services/ruleEngine");
const RULE_ENGINE_INTERVAL_MIN = Number(process.env.RULE_ENGINE_INTERVAL_MINUTES) || 15;
function startRuleEngineScheduler() {
    const cronExpr = `*/${RULE_ENGINE_INTERVAL_MIN} * * * *`;
    node_cron_1.default.schedule(cronExpr, async () => {
        try {
            const result = await (0, ruleEngine_1.runRuleEngineCycle)();
            if (result.queued > 0 || result.skipped > 0) {
                console.log(`[CF2-RuleEngine] Cycle complete: queued=${result.queued}, skipped=${result.skipped}`);
            }
        }
        catch (err) {
            console.error('[CF2-RuleEngine] Error:', err);
        }
    });
    console.log(`[CF2-RuleEngine] Scheduled every ${RULE_ENGINE_INTERVAL_MIN} minutes`);
}
