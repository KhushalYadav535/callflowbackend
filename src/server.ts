import 'dotenv/config'
import express from 'express'
import { startRetryScheduler } from './jobs/retryScheduler'
import { startRuleEngineScheduler } from './jobs/ruleEngineScheduler'
import { startDispatchWorker } from './jobs/dispatchWorkerScheduler'
import { startPullSyncScheduler } from './jobs/pullSyncScheduler'
import cors from 'cors'
import morgan from 'morgan'
import mongoose from 'mongoose'
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import campaignRoutes from './routes/campaigns'
import contactRoutes from './routes/contacts'
import webhookRoutes from './routes/webhooks'
import settingsRoutes from './routes/settings'
import dashboardRoutes from './routes/dashboard'
import dataRoutes from './routes/data'
import accountsRoutes from './routes/accounts'
import botconfigsRoutes from './routes/botconfigs'
import eventsRoutes from './routes/events'
import analyticsRoutes from './routes/analytics'
import adminAuthRoutes from './routes/adminAuth'
import adminRoutes from './routes/admin'

const app = express()

const allowedOrigins = [
  'http://localhost:3000',
  'https://callflow-two.vercel.app'
]
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(
  express.json({
    verify: (req: express.Request, _res, buf) => {
      const path = req.originalUrl?.split('?')[0] ?? ''
      if (path.match(/\/api\/data\/tenant\/[^/]+\/accounts$/) && !path.includes('upload')) {
        ;(req as express.Request & { rawBody?: Buffer }).rawBody = buf
      }
    }
  })
)
app.use(morgan('dev'))
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/campaigns', campaignRoutes)
app.use('/api/contacts', contactRoutes)
app.use('/api/webhooks', webhookRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/data', dataRoutes)
app.use('/api/accounts', accountsRoutes)
app.use('/api/botconfigs', botconfigsRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/admin/auth', adminAuthRoutes)
app.use('/api/admin', adminRoutes)

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/callflow'
const PORT = process.env.PORT || 5000

async function start() {
  try {
    await mongoose.connect(MONGO_URI)
    console.log('Connected to MongoDB')
    startRetryScheduler()
    startRuleEngineScheduler()
    startDispatchWorker()
    startPullSyncScheduler()

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' })
    })

    app.listen(PORT, () => {
      console.log(`API server listening on port ${PORT}`)
    })
  } catch (err) {
    console.error('Failed to start server', err)
    process.exit(1)
  }
}

start()

