import 'dotenv/config'
import express from 'express'
import { startRetryScheduler } from './jobs/retryScheduler'
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

const app = express()

const allowedOrigins = [
  'http://localhost:3000',
  'https://callflow-two.vercel.app'
]
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json())
app.use(morgan('dev'))
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/campaigns', campaignRoutes)
app.use('/api/contacts', contactRoutes)
app.use('/api/webhooks', webhookRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/dashboard', dashboardRoutes)

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/callflow'
const PORT = process.env.PORT || 5000

async function start() {
  try {
    await mongoose.connect(MONGO_URI)
    console.log('Connected to MongoDB')
    startRetryScheduler()

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

