/**
 * Provision offerings to a tenant (company)
 * Run: npx ts-node scripts/provision-tenant.ts <companyId> <offeringId1> [offeringId2 ...]
 * Example: npx ts-node scripts/provision-tenant.ts 507f1f77bcf86cd799439011 reminder-bot recovery-bot
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { Company } from '../src/models/Company'
import { TenantEntitlement } from '../src/models/TenantEntitlement'
import { TenantOfferingState } from '../src/models/TenantOfferingState'
import { PlatformOffering } from '../src/models/PlatformOffering'

async function provision() {
  const args = process.argv.slice(2)
  const companyId = args[0]
  const offeringIds = args.slice(1)

  if (!companyId || !offeringIds.length) {
    console.error('Usage: npx ts-node scripts/provision-tenant.ts <companyId> <offeringId1> [offeringId2 ...]')
    process.exit(1)
  }

  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/callflow'
  await mongoose.connect(uri)

  const company = await Company.findById(companyId)
  if (!company) {
    console.error('Company not found:', companyId)
    process.exit(1)
  }

  const companyObjId = new mongoose.Types.ObjectId(companyId)
  const now = new Date()

  for (const offeringId of offeringIds) {
    const offering = await PlatformOffering.findOne({ offeringId })
    if (!offering) {
      console.warn('Offering not found:', offeringId, '- skipping')
      continue
    }

    await TenantEntitlement.findOneAndUpdate(
      { companyId: companyObjId, offeringId },
      {
        $set: {
          isProvisioned: true,
          provisionedAt: now,
          provisionedBy: 'provision-tenant-script',
          configLimits: { allowedCapabilities: offering.capabilities ?? [] }
        }
      },
      { upsert: true }
    )

    await TenantOfferingState.findOneAndUpdate(
      { companyId: companyObjId, offeringId },
      {
        $set: {
          isActive: true,
          activatedAt: now,
          toggledBy: 'provision-tenant-script'
        }
      },
      { upsert: true }
    )

    console.log(`  Provisioned: ${offeringId}`)
  }

  console.log('Done. Tenant provisioned.')
  process.exit(0)
}

provision().catch((err) => {
  console.error(err)
  process.exit(1)
})
