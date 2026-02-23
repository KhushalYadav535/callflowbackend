import cron from 'node-cron'
import cronParser from 'cron-parser'
import mongoose from 'mongoose'
import { DataSourceConfig } from '../models/DataSourceConfig'
import { runPullSync } from '../services/pullSyncService'
import { writeCallEvent } from '../services/eventWriter'

const CHECK_INTERVAL_MIN = Number(process.env.PULL_SYNC_CHECK_INTERVAL_MINUTES) || 5

export function startPullSyncScheduler() {
  const cronExpr = `*/${CHECK_INTERVAL_MIN} * * * *`
  cron.schedule(cronExpr, async () => {
    try {
      const configs = await DataSourceConfig.find({
        mode: 'pull',
        pullUrl: { $exists: true, $nin: [null, ''] },
        pullScheduleCron: { $exists: true, $nin: [null, ''] }
      }).lean()

      const now = new Date()
      const graceMs = Math.min(CHECK_INTERVAL_MIN * 60 * 1000, 5 * 60 * 1000)

      for (const ds of configs) {
        const cronExpr = (ds as { pullScheduleCron?: string }).pullScheduleCron
        const companyId = (ds as { companyId: mongoose.Types.ObjectId }).companyId
        if (!cronExpr || !companyId) continue

        try {
          const interval = cronParser.parse(cronExpr)
          const prevDate = interval.prev()
          const prev = typeof prevDate?.toDate === 'function' ? prevDate.toDate() : new Date(prevDate as unknown as number)
          const timeSincePrev = now.getTime() - prev.getTime()
          if (timeSincePrev > graceMs || timeSincePrev < 0) continue
          // Avoid running twice in same cycle

          const lastSync = (ds as { lastSyncAt?: Date }).lastSyncAt
          if (lastSync && lastSync.getTime() >= prev.getTime()) continue

          const result = await runPullSync(companyId)
          if (result.ok) {
            console.log(`[CF2-PullSync] ${companyId}: ${result.created} created, ${result.updated} updated`)
          }
        } catch (err) {
          console.error(`[CF2-PullSync] ${companyId} error:`, err)
          await writeCallEvent({
            companyId,
            eventType: 'SYNC_FAILED',
            payload: { mode: 'pull', errorMessage: err instanceof Error ? err.message : 'Unknown error' },
            source: 'system',
            timestamp: new Date()
          }).catch(() => {})
        }
      }
    } catch (err) {
      console.error('[CF2-PullSync] Scheduler error:', err)
    }
  })
  console.log(`[CF2-PullSync] Scheduler running every ${CHECK_INTERVAL_MIN} minutes`)
}
