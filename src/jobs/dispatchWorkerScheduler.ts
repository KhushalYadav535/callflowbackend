import cron from 'node-cron'
import { runDispatchCycle } from './dispatchWorker'

const DISPATCH_INTERVAL_MIN = Number(process.env.DISPATCH_WORKER_INTERVAL_MINUTES) || 5

export function startDispatchWorker() {
  const cronExpr = `*/${DISPATCH_INTERVAL_MIN} * * * *`
  cron.schedule(cronExpr, async () => {
    try {
      const result = await runDispatchCycle()
      if (result.dispatched > 0 || result.failed > 0) {
        console.log(`[CF2-DispatchWorker] Cycle: dispatched=${result.dispatched}, failed=${result.failed}`)
      }
    } catch (err) {
      console.error('[CF2-DispatchWorker] Error:', err)
    }
  })
  console.log(`[CF2-DispatchWorker] Scheduled every ${DISPATCH_INTERVAL_MIN} minutes`)
}
