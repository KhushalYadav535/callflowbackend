/**
 * Migrate data from local MongoDB to Atlas
 * Run: npx ts-node scripts/seed-to-atlas.ts
 * Ensure local MongoDB is running and .env has Atlas MONGO_URI
 */
import 'dotenv/config'
import mongoose from 'mongoose'

const LOCAL_URI = 'mongodb://127.0.0.1:27017/callflow'
const COLLECTIONS = ['companies', 'campaigns', 'contacts', 'calllogs'] as const

async function seed() {
  const atlasUri = process.env.MONGO_URI
  if (!atlasUri || !atlasUri.includes('mongodb+srv')) {
    console.error('MONGO_URI in .env must point to Atlas (mongodb+srv://...)')
    process.exit(1)
  }

  console.log('Connecting to local MongoDB...')
  const localConn = await mongoose.createConnection(LOCAL_URI).asPromise()
  console.log('Connected to local.')

  console.log('Connecting to Atlas...')
  const atlasConn = await mongoose.createConnection(atlasUri).asPromise()
  console.log('Connected to Atlas.')

  for (const collName of COLLECTIONS) {
    try {
      const localColl = localConn.collection(collName)
      const atlasColl = atlasConn.collection(collName)
      const docs = await localColl.find({}).toArray()

      if (docs.length === 0) {
        console.log(`  ${collName}: 0 documents (skipping)`)
        continue
      }

      await atlasColl.deleteMany({})
      const result = await atlasColl.insertMany(docs)
      console.log(`  ${collName}: ${result.insertedCount} documents seeded`)
    } catch (err) {
      console.error(`  ${collName}: error`, err)
    }
  }

  await localConn.close()
  await atlasConn.close()
  console.log('Done. Atlas is seeded with local data.')
  process.exit(0)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
