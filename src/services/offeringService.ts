import mongoose from 'mongoose'
import { PlatformOffering } from '../models/PlatformOffering'
import { TenantEntitlement } from '../models/TenantEntitlement'
import { TenantOfferingState } from '../models/TenantOfferingState'

export async function canDispatch(
  companyId: mongoose.Types.ObjectId,
  offeringId: string
): Promise<boolean> {
  const now = new Date()
  const [offering, entitlement, state] = await Promise.all([
    PlatformOffering.findOne({ offeringId }),
    TenantEntitlement.findOne({ companyId, offeringId }),
    TenantOfferingState.findOne({ companyId, offeringId })
  ])

  if (!offering || !offering.isAvailable) return false
  if (!entitlement || !entitlement.isProvisioned) return false
  if (entitlement.expiresAt && entitlement.expiresAt < now) return false
  if (!state || !state.isActive) return false

  return true
}
