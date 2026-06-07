require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (especially chrome-extension:// origins)
app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve static admin files
const path = require('path');
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Rate Limiting: Limit requests from IP to secure verification endpoint
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { success: false, error: 'Too many verification attempts from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin Authorization Middleware
function requireAdmin(req, res, next) {
  const adminSecret = req.headers['x-admin-secret'];
  const configuredSecret = process.env.ADMIN_SECRET;

  if (!configuredSecret) {
    return res.status(500).json({ success: false, error: 'Admin configuration error: ADMIN_SECRET not set on server.' });
  }

  if (adminSecret !== configuredSecret) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid X-Admin-Secret header.' });
  }
  next();
}

// Generate unique license key in format TO-XXXX-XXXX-XXXX
function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const makeGroup = () => Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
  return `TO-${makeGroup()}-${makeGroup()}-${makeGroup()}`;
}

// ---- ROUTES ----

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: Date.now() });
});

// 1. PUBLIC: Validate License & issue signed JWT
app.post('/v1/license/verify', verifyLimiter, async (req, res) => {
  const { licenseKey, email, deviceId } = req.body;

  if (!licenseKey) {
    return res.status(400).json({ success: false, error: 'licenseKey is required.' });
  }
  if (!deviceId) {
    return res.status(400).json({ success: false, error: 'Device ID is required. Please update your extension to the latest version.' });
  }

  const key = licenseKey.trim();

  // Special mock key bypass in backend (optional, keep for seamless test config)
  if (key === 'PRO-KEY-123') {
    const mockExpires = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const token = jwt.sign(
      { tier: 'PRO', key: 'PRO-KEY-123', expiresAt: mockExpires },
      process.env.JWT_SECRET || 'fallback_secret_temp',
      { expiresIn: '30d' }
    );
    return res.json({
      success: true,
      token,
      tier: 'PRO',
      status: 'active',
      expiresAt: mockExpires
    });
  }

  try {
    const license = await db.get('SELECT * FROM licenses WHERE key = ?', [key]);

    if (!license) {
      return res.status(404).json({ success: false, error: 'Invalid license key. Check spelling or purchase a key.' });
    }

    if (license.status !== 'active') {
      return res.status(403).json({ success: false, error: `License key status is "${license.status}".` });
    }

    // Verify or bind email
    if (license.email === null) {
      if (!email || !email.trim()) {
        return res.status(400).json({ success: false, error: 'An email address is required to redeem this license key.' });
      }
      const newEmail = email.trim().toLowerCase();
      // Bind the email to the license (redeem it)
      await db.run('UPDATE licenses SET email = ? WHERE key = ?', [newEmail, key]);
      license.email = newEmail;
    } else {
      // Verify email matches the bound email
      const clientEmail = email ? email.trim().toLowerCase() : '';
      const dbEmail = license.email.trim().toLowerCase();
      if (clientEmail !== dbEmail) {
        return res.status(403).json({ success: false, error: 'This license key has already been redeemed by a different email address.' });
      }
    }

    // Verify or bind device
    if (license.device_id === null) {
      await db.run('UPDATE licenses SET device_id = ? WHERE key = ?', [deviceId, key]);
      license.device_id = deviceId;
    } else {
      if (license.device_id !== deviceId) {
        return res.status(403).json({ success: false, error: 'This license key is already active on another device.' });
      }
    }

    if (license.expires_at !== null && Date.now() > license.expires_at) {
      // Auto-update expired license status in DB
      await db.run('UPDATE licenses SET status = "expired" WHERE key = ?', [key]);
      return res.status(403).json({ success: false, error: 'License key has expired.' });
    }

    // Sign JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ success: false, error: 'Server configuration error: JWT_SECRET not set.' });
    }

    // JWT token expiration matches license expiration or max 30d
    let tokenExpiry = '30d';
    if (license.expires_at !== null) {
      const msLeft = license.expires_at - Date.now();
      tokenExpiry = Math.max(1, Math.floor(msLeft / 1000)); // in seconds
    }

    const token = jwt.sign(
      { tier: license.tier, key: license.key, expiresAt: license.expires_at },
      jwtSecret,
      { expiresIn: tokenExpiry }
    );

    res.json({
      success: true,
      token,
      tier: license.tier,
      status: license.status,
      expiresAt: license.expires_at
    });

  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ success: false, error: 'Internal server error verifying license.' });
  }
});

// 2. ADMIN: Generate License keys
app.post('/v1/admin/license/generate', requireAdmin, async (req, res) => {
  const { tier = 'PRO', durationDays = 30, count = 1, email = null, name = null } = req.body;

  if (count < 1 || count > 100) {
    return res.status(400).json({ success: false, error: 'count must be between 1 and 100.' });
  }

  try {
    const generatedKeys = [];
    const now = Date.now();
    const expiresAt = durationDays > 0 ? now + durationDays * 24 * 60 * 60 * 1000 : null;

    for (let i = 0; i < count; i++) {
      const key = generateLicenseKey();
      await db.run(
        'INSERT INTO licenses (key, tier, status, email, name, created_at, expires_at) VALUES (?, ?, "active", ?, ?, ?, ?)',
        [key, tier, email ? email.trim() : null, name ? name.trim() : null, now, expiresAt]
      );
      generatedKeys.push({ key, tier, email, name, expiresAt });
    }

    res.json({
      success: true,
      message: `Successfully generated ${count} license key(s).`,
      keys: generatedKeys
    });

  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate license keys.' });
  }
});

// 3. ADMIN: List all Licenses (Keys and User Details)
app.get('/v1/admin/licenses', requireAdmin, async (req, res) => {
  try {
    const licenses = await db.all('SELECT * FROM licenses ORDER BY created_at DESC');
    res.json({ success: true, licenses });
  } catch (error) {
    console.error('List licenses error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve licenses.' });
  }
});

// 4. ADMIN: Revoke License key
app.post('/v1/admin/license/revoke', requireAdmin, async (req, res) => {
  const { licenseKey } = req.body;

  if (!licenseKey) {
    return res.status(400).json({ success: false, error: 'licenseKey is required.' });
  }

  try {
    const key = licenseKey.trim();
    const license = await db.get('SELECT * FROM licenses WHERE key = ?', [key]);

    if (!license) {
      return res.status(404).json({ success: false, error: 'License key not found.' });
    }

    await db.run('UPDATE licenses SET status = "revoked" WHERE key = ?', [key]);
    res.json({ success: true, message: `License "${key}" successfully revoked.` });

  } catch (error) {
    console.error('Revoke error:', error);
    res.status(500).json({ success: false, error: 'Failed to revoke license key.' });
  }
});

// 5. ADMIN: Reset Device Lock
app.post('/v1/admin/license/reset-device', requireAdmin, async (req, res) => {
  const { licenseKey } = req.body;

  if (!licenseKey) {
    return res.status(400).json({ success: false, error: 'licenseKey is required.' });
  }

  try {
    const key = licenseKey.trim();
    const license = await db.get('SELECT * FROM licenses WHERE key = ?', [key]);

    if (!license) {
      return res.status(404).json({ success: false, error: 'License key not found.' });
    }

    await db.run('UPDATE licenses SET device_id = NULL WHERE key = ?', [key]);
    res.json({ success: true, message: `Device lock for "${key}" successfully reset. The next activation will bind it to the new device.` });

  } catch (error) {
    console.error('Reset device error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset device lock.' });
  }
});

// Initialize database schema and start server
db.initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`TaskOrbit backend listening on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database schema:', err);
  process.exit(1);
});

// Graceful Shutdown
const shutdown = async () => {
  console.log('Shutting down API server...');
  try {
    await db.close();
    console.log('SQLite database closed.');
    process.exit(0);
  } catch (err) {
    console.error('Error during database close:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
