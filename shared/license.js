export async function getActiveLicense() {
  const data = await chrome.storage.local.get("settings");
  const settings = data.settings || {};
  
  if (!settings.licenseData || !settings.licenseData.isValid) {
    return { isValid: false, tier: "LITE" };
  }
  
  return {
    isValid: true,
    tier: settings.licenseData.tier || "PRO",
    key: settings.licenseData.key || null,
    email: settings.licenseData.email || null
  };
}

export async function getDeviceId() {
  const data = await chrome.storage.local.get("settings");
  let settings = data.settings || {};
  if (!settings.deviceId) {
    settings.deviceId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
    await chrome.storage.local.set({ settings });
  }
  return settings.deviceId;
}
export async function activateLicense(key, email) {
  const trimmed = key.trim();
  const trimmedEmail = email ? email.trim() : "";
  if (!trimmed) return { success: false, error: "License key is required." };
  if (!trimmedEmail) return { success: false, error: "Email address is required." };

  try {
    // Attempt real backend call
    // Note: We use a try-catch and check if we are in testing mode (PRO-KEY-123).
    // Once the real server is up, it will hit this endpoint.
    let responseData = null;

    if (trimmed === "PRO-KEY-123") {
      // Mocked Response for testing
      responseData = {
        success: true,
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mocked_payload.signature",
        tier: "PRO",
        status: "active",
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
      };
    } else {
      const deviceId = await getDeviceId();
      const res = await fetch("https://taskorbit.subho.net/v1/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: trimmed, email: trimmedEmail, deviceId })
      });
      responseData = await res.json();
    }

    if (responseData && responseData.success) {
      const data = await chrome.storage.local.get("settings");
      const settings = data.settings || {};
      
      settings.licenseData = {
        isValid: true,
        tier: responseData.tier || "PRO",
        key: trimmed,
        email: trimmedEmail,
        token: responseData.token,
        lastChecked: Date.now(),
        offlineGraceEnds: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days grace period
      };
      
      await chrome.storage.local.set({ settings });
      return { success: true };
    } else {
      return { success: false, error: responseData?.error || "Invalid license key." };
    }

  } catch (error) {
    return { success: false, error: "Network error checking license. Try again later." };
  }
}

export async function verifyStoredLicenseSilent() {
  const data = await chrome.storage.local.get("settings");
  const settings = data.settings || {};
  
  if (!settings.licenseData || !settings.licenseData.key) {
    return { valid: false };
  }

  const key = settings.licenseData.key;
  
  try {
    let responseData = null;
    if (key === "PRO-KEY-123") {
      responseData = { success: true, tier: "PRO", status: "active" };
    } else {
      const deviceId = await getDeviceId();
      const res = await fetch("https://taskorbit.subho.net/v1/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: key, email: settings.licenseData.email || "", deviceId })
      });
      responseData = await res.json();
    }

    if (responseData && responseData.success) {
      settings.licenseData.lastChecked = Date.now();
      settings.licenseData.offlineGraceEnds = Date.now() + 7 * 24 * 60 * 60 * 1000;
      settings.licenseData.tier = responseData.tier || "PRO";
      settings.licenseData.isValid = true;
      await chrome.storage.local.set({ settings });
      return { valid: true, tier: settings.licenseData.tier };
    } else {
      // License explicitly rejected by server (e.g. refunded/revoked)
      settings.licenseData.isValid = false;
      await chrome.storage.local.set({ settings });
      return { valid: false };
    }
  } catch (error) {
    // Network error (offline). Check grace period.
    const now = Date.now();
    if (now > settings.licenseData.offlineGraceEnds) {
      settings.licenseData.isValid = false;
      await chrome.storage.local.set({ settings });
      return { valid: false, reason: "grace_expired" };
    }
    // Still within grace period, keep it valid
    return { valid: true, tier: settings.licenseData.tier, offline: true };
  }
}

export async function removeLicense() {
  const data = await chrome.storage.local.get("settings");
  const settings = data.settings || {};
  settings.licenseData = null;
  await chrome.storage.local.set({ settings });
}
