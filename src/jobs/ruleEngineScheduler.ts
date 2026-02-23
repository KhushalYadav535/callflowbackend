import cron from 'node-cron'
import { runRuleEngineCycle } from '../services/ruleEngine'

const RULE_ENGINE_INTERVAL_MIN = Number(process.env.RULE_ENGINE_INTERVAL_MINUTES) || 15

export function startRuleEngineScheduler() {
  const cronExpr = `*/${RULE_ENGINE_INTERVAL_MIN} * * * *`
  cron.schedule(cronExpr, async () => {
    try {
      const result = await runRuleEngineCycle()
      if (result.queued > 0 || result.skipped > 0) {
        console.log(`[CF2-RuleEngine] Cycle complete: queued=${result.queued}, skipped=${result.skipped}`)
      }
    } catch (err) {
      console.error('[CF2-RuleEngine] Error:', err)
    }
  })
  console.log(`[CF2-RuleEngine] Scheduled every ${RULE_ENGINE_INTERVAL_MIN} minutes`)
}
