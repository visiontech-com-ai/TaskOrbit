const { exec } = require('child_process');
const http = require('http');

// Simple integration test for backend endpoints
async function runTests() {
  console.log('--- Starting API Integration Tests ---');
  
  const ADMIN_SECRET = 'TO_ADM_KEY_7c2b3e8a9d10ef2a3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c';
  const BASE_URL = 'http://localhost:3000';

  const request = (path, method, body, headers = {}) => {
    return new Promise((resolve, reject) => {
      const url = `${BASE_URL}${path}`;
      const payload = JSON.stringify(body);
      const req = http.request(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ statusCode: res.statusCode, body: data });
          }
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  };

  try {
    // 1. Health check
    console.log('Testing /health...');
    const healthRes = await request('/health', 'GET');
    console.log('Health Response Status:', healthRes.statusCode);
    if (healthRes.statusCode !== 200 || healthRes.body.status !== 'healthy') {
      throw new Error('Health check failed');
    }
    console.log('Health check: OK');

    // 2. Generate a key (no secret header - should fail)
    console.log('\nTesting generate license (no auth)...');
    const genNoAuth = await request('/v1/admin/license/generate', 'POST', { tier: 'PRO', durationDays: 30 });
    console.log('Response Status:', genNoAuth.statusCode, genNoAuth.body);
    if (genNoAuth.statusCode !== 401) {
      throw new Error('Generate should require authentication');
    }
    console.log('Generate (no auth) blocked: OK');

    // 3. Generate a key (with secret header - should pass)
    console.log('\nTesting generate license (with auth)...');
    const genAuth = await request('/v1/admin/license/generate', 'POST', {
      tier: 'PRO',
      durationDays: 10,
      count: 1
    }, { 'x-admin-secret': ADMIN_SECRET });
    console.log('Response Status:', genAuth.statusCode, genAuth.body);
    if (genAuth.statusCode !== 200 || !genAuth.body.success || genAuth.body.keys.length !== 1) {
      throw new Error('Key generation failed');
    }
    const generatedKey = genAuth.body.keys[0].key;
    console.log(`Generated Key: ${generatedKey} - OK`);

    // 4. Verify the generated key
    console.log(`\nTesting verify generated key: ${generatedKey}...`);
    const verifyRes = await request('/v1/license/verify', 'POST', { licenseKey: generatedKey });
    console.log('Response Status:', verifyRes.statusCode, verifyRes.body);
    if (verifyRes.statusCode !== 200 || !verifyRes.body.success || verifyRes.body.tier !== 'PRO') {
      throw new Error('Verification of generated key failed');
    }
    console.log('Verification: OK');

    // 5. Revoke key
    console.log(`\nTesting revoke key: ${generatedKey}...`);
    const revokeRes = await request('/v1/admin/license/revoke', 'POST', { licenseKey: generatedKey }, { 'x-admin-secret': ADMIN_SECRET });
    console.log('Response Status:', revokeRes.statusCode, revokeRes.body);
    if (revokeRes.statusCode !== 200 || !revokeRes.body.success) {
      throw new Error('Revocation failed');
    }
    console.log('Revocation: OK');

    // 6. Verify key again (should fail)
    console.log(`\nTesting verify revoked key again...`);
    const verifyAgainRes = await request('/v1/license/verify', 'POST', { licenseKey: generatedKey });
    console.log('Response Status:', verifyAgainRes.statusCode, verifyAgainRes.body);
    if (verifyAgainRes.statusCode !== 403 || verifyAgainRes.body.success) {
      throw new Error('Verifying revoked key should fail');
    }
    console.log('Revoked verification blocked: OK');

    console.log('\n--- ALL API INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
    process.exit(0);

  } catch (err) {
    console.error('Test run failed:', err.message);
    process.exit(1);
  }
}

runTests();
