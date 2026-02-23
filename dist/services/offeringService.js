"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canDispatch = canDispatch;
const PlatformOffering_1 = require("../models/PlatformOffering");
const TenantEntitlement_1 = require("../models/TenantEntitlement");
const TenantOfferingState_1 = require("../models/TenantOfferingState");
async function canDispatch(companyId, offeringId) {
    const now = new Date();
    const [offering, entitlement, state] = await Promise.all([
        PlatformOffering_1.PlatformOffering.findOne({ offeringId }),
        TenantEntitlement_1.TenantEntitlement.findOne({ companyId, offeringId }),
        TenantOfferingState_1.TenantOfferingState.findOne({ companyId, offeringId })
    ]);
    if (!offering || !offering.isAvailable)
        return false;
    if (!entitlement || !entitlement.isProvisioned)
        return false;
    if (entitlement.expiresAt && entitlement.expiresAt < now)
        return false;
    if (!state || !state.isActive)
        return false;
    return true;
}
