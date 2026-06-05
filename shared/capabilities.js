import { getActiveLicense } from "./license.js";

export const TIER_CAPABILITIES = {
  LITE: {
    maxWorkflows: 3,
    maxSteps: 10,
    allowAutoRun: false,
    allowLoops: false,
    allowVariables: false,
    allowConditions: false,
    allowDataProcessing: false
  },
  PRO: {
    maxWorkflows: Infinity,
    maxSteps: Infinity,
    allowAutoRun: true,
    allowLoops: true,
    allowVariables: true,
    allowConditions: true,
    allowDataProcessing: true
  }
};

export async function getCapabilities() {
  const license = await getActiveLicense();
  return license && license.isValid ? TIER_CAPABILITIES[license.tier] || TIER_CAPABILITIES.PRO : TIER_CAPABILITIES.LITE;
}
