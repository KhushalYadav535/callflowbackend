/**
 * Seed default Platform Admin (Super Admin)
 * Email: sdsite@sentientdigital.in
 * Password: Sentient1234@
 * Run: npx ts-node scripts/seed-admin.ts
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { PlatformAdmin } from '../src/models/PlatformAdmin'

const DEFAULT_EMAIL = 'sdsite@sentientdigital.in'
const DEFAULT_PASSWORD = 'Sentient1234@'

async function seed() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/callflow'
  await mongoose.connect(uri)
  console.log('Connected to MongoDB')

  const existing = await PlatformAdmin.findOne({ email: DEFAULT_EMAIL })
  if (existing) {
    console.log('Super Admin already exists:', DEFAULT_EMAIL)
    process.exit(0)
    return
  }

  const hashed = await bcrypt.hash(DEFAULT_PASSWORD, 10)
  await PlatformAdmin.create({
    email: DEFAULT_EMAIL,
    password: hashed,
    name: 'Super Admin',
    isActive: true
  })
  console.log('Super Admin created:', DEFAULT_EMAIL)
  process.exit(0)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
