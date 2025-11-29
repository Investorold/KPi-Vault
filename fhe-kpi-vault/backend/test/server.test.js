import assert from 'node:assert';
import { spawn } from 'child_process';
import http from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Simple test framework since we don't have Jest/Mocha in backend
const tests = [];
let serverProcess = null;
const TEST_PORT = 3102;
const TEST_METRICS_FILE = join(process.cwd(), 'test-metrics.json');

function test(name, fn) {
  tests.push({ name, fn });
}

function beforeAll(fn) {
  tests.push({ type: 'beforeAll', fn });
}

function afterAll(fn) {
  tests.push({ type: 'afterAll', fn });
}

function beforeEach(fn) {
  tests.push({ type: 'beforeEach', fn });
}

function afterEach(fn) {
  tests.push({ type: 'afterEach', fn });
}

function describe(name, fn) {
  // For compatibility, just run the function
  fn();
}

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: TEST_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, body: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

function normaliseAddress(addr) {
  if (!addr) return '';
  return addr.toLowerCase().trim();
}

// Test suite
beforeAll(async () => {
  // Backup original metrics.json if it exists
  const originalFile = join(process.cwd(), 'metrics.json');
  if (existsSync(originalFile)) {
    const backup = readFileSync(originalFile, 'utf8');
    writeFileSync(originalFile + '.backup', backup);
  }

  // Start test server
  return new Promise((resolve) => {
    serverProcess = spawn('node', ['server.js'], {
      env: { ...process.env, PORT: TEST_PORT },
      stdio: 'pipe',
    });

    // Wait for server to be ready
    setTimeout(resolve, 1000);
  });
});

afterAll(() => {
  if (serverProcess) {
    serverProcess.kill();
  }

  // Restore original metrics.json
  const originalFile = join(process.cwd(), 'metrics.json');
  const backupFile = originalFile + '.backup';
  if (existsSync(backupFile)) {
    writeFileSync(originalFile, readFileSync(backupFile, 'utf8'));
  }
});

beforeEach(() => {
  // Reset test metrics file
  writeFileSync(join(process.cwd(), 'metrics.json'), JSON.stringify({ metrics: {}, access: {} }, null, 2));
});

describe('Backend API Tests', () => {
  test('GET /metrics/meta/:ownerAddress - should return empty object for new owner', async () => {
    const owner = '0x1234567890123456789012345678901234567890';
    const response = await makeRequest('GET', `/metrics/meta/${owner}`);

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body, {});
  });

  test('POST /metrics/meta/:ownerAddress - should save metadata', async () => {
    const owner = '0x1234567890123456789012345678901234567890';
    const metadata = {
      metricId: 'mrr',
      label: 'Monthly Recurring Revenue',
      unit: 'USD',
      category: 'Revenue',
      description: 'Total monthly recurring revenue',
    };

    const response = await makeRequest('POST', `/metrics/meta/${owner}`, metadata);

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.metadata.metricId, 'mrr');
    assert.strictEqual(response.body.metadata.label, 'Monthly Recurring Revenue');
  });

  test('GET /metrics/meta/:ownerAddress - should return saved metadata', async () => {
    const owner = '0x1234567890123456789012345678901234567890';
    const metadata = {
      metricId: 'mrr',
      label: 'Monthly Recurring Revenue',
      unit: 'USD',
      category: 'Revenue',
      description: 'Total monthly recurring revenue',
    };

    await makeRequest('POST', `/metrics/meta/${owner}`, metadata);
    const response = await makeRequest('GET', `/metrics/meta/${owner}`);

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.mrr.metricId, 'mrr');
    assert.strictEqual(response.body.mrr.label, 'Monthly Recurring Revenue');
  });

  test('POST /metrics/meta/:ownerAddress - should update existing metadata', async () => {
    const owner = '0x1234567890123456789012345678901234567890';
    const metadata1 = {
      metricId: 'mrr',
      label: 'Monthly Recurring Revenue',
      unit: 'USD',
    };

    const metadata2 = {
      metricId: 'mrr',
      label: 'MRR Updated',
      unit: 'USD',
    };

    await makeRequest('POST', `/metrics/meta/${owner}`, metadata1);
    const response = await makeRequest('POST', `/metrics/meta/${owner}`, metadata2);

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.metadata.label, 'MRR Updated');
  });

  test('DELETE /metrics/meta/:ownerAddress/:metricId - should delete metadata', async () => {
    const owner = '0x1234567890123456789012345678901234567890';
    const metadata = {
      metricId: 'mrr',
      label: 'Monthly Recurring Revenue',
      unit: 'USD',
    };

    await makeRequest('POST', `/metrics/meta/${owner}`, metadata);
    const deleteResponse = await makeRequest('DELETE', `/metrics/meta/${owner}/mrr`);

    assert.strictEqual(deleteResponse.status, 200);
    assert.strictEqual(deleteResponse.body.success, true);

    const getResponse = await makeRequest('GET', `/metrics/meta/${owner}`);
    assert.strictEqual(getResponse.status, 200);
    assert.strictEqual(getResponse.body.mrr, undefined);
  });

  test('POST /metrics/access/grant - should grant access', async () => {
    const owner = '0x1234567890123456789012345678901234567890';
    const viewer = '0x9876543210987654321098765432109876543210';
    const payload = {
      ownerAddress: owner,
      metricId: 'mrr',
      viewerAddress: viewer,
    };

    const response = await makeRequest('POST', '/metrics/access/grant', payload);

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.success, true);
  });

  test('POST /metrics/access/revoke - should revoke access', async () => {
    const owner = '0x1234567890123456789012345678901234567890';
    const viewer = '0x9876543210987654321098765432109876543210';
    
    // First grant access
    await makeRequest('POST', '/metrics/access/grant', {
      ownerAddress: owner,
      metricId: 'mrr',
      viewerAddress: viewer,
    });

    // Then revoke
    const response = await makeRequest('POST', '/metrics/access/revoke', {
      ownerAddress: owner,
      metricId: 'mrr',
      viewerAddress: viewer,
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.success, true);
  });

  test('GET /metrics/access/:ownerAddress/:metricId - should return access list', async () => {
    const owner = '0x1234567890123456789012345678901234567890';
    const viewer1 = '0x9876543210987654321098765432109876543210';
    const viewer2 = '0x1111111111111111111111111111111111111111';

    await makeRequest('POST', '/metrics/access/grant', {
      ownerAddress: owner,
      metricId: 'mrr',
      viewerAddress: viewer1,
    });

    await makeRequest('POST', '/metrics/access/grant', {
      ownerAddress: owner,
      metricId: 'mrr',
      viewerAddress: viewer2,
    });

    const response = await makeRequest('GET', `/metrics/access/${owner}/mrr`);

    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.body.viewers));
    assert(response.body.viewers.includes(viewer1.toLowerCase()));
    assert(response.body.viewers.includes(viewer2.toLowerCase()));
  });

  test('POST /metrics/meta/:ownerAddress - should normalise address case', async () => {
    const owner = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';
    const metadata = {
      metricId: 'mrr',
      label: 'Monthly Recurring Revenue',
    };

    await makeRequest('POST', `/metrics/meta/${owner}`, metadata);
    const response = await makeRequest('GET', `/metrics/meta/${owner.toLowerCase()}`);

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.mrr.metricId, 'mrr');
  });

  test('POST /metrics/meta/:ownerAddress - should reject missing metricId', async () => {
    const owner = '0x1234567890123456789012345678901234567890';
    const metadata = {
      label: 'Monthly Recurring Revenue',
    };

    const response = await makeRequest('POST', `/metrics/meta/${owner}`, metadata);
    assert.strictEqual(response.status, 400);
  });

  test('POST /metrics/access/grant - should reject missing parameters', async () => {
    const response1 = await makeRequest('POST', '/metrics/access/grant', {
      ownerAddress: '0x1234567890123456789012345678901234567890',
      metricId: 'mrr',
    });

    assert.strictEqual(response1.status, 400);

    const response2 = await makeRequest('POST', '/metrics/access/grant', {
      ownerAddress: '0x1234567890123456789012345678901234567890',
    });

    assert.strictEqual(response2.status, 400);
  });

  test('POST /metrics/access/revoke - should reject revoking non-existent access', async () => {
    // Use unique addresses to avoid conflicts
    const owner = '0x9999999999999999999999999999999999999999';
    const viewer = '0x8888888888888888888888888888888888888888';
    const response = await makeRequest('POST', '/metrics/access/revoke', {
      ownerAddress: owner,
      metricId: 'nonexistent',
      viewerAddress: viewer,
    });

    assert.strictEqual(response.status, 404);
  });

  test('GET /metrics/access/:ownerAddress - should return empty object for new owner', async () => {
    // Use unique address to avoid conflicts with other tests
    const owner = '0x7777777777777777777777777777777777777777';
    const response = await makeRequest('GET', `/metrics/access/${owner}`);

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body, {});
  });

  test('POST /metrics/access/grant - should handle multiple viewers for same metric', async () => {
    const owner = '0x1234567890123456789012345678901234567890';
    const viewer1 = '0x9876543210987654321098765432109876543210';
    const viewer2 = '0x1111111111111111111111111111111111111111';

    await makeRequest('POST', '/metrics/access/grant', {
      ownerAddress: owner,
      metricId: 'mrr',
      viewerAddress: viewer1,
    });

    await makeRequest('POST', '/metrics/access/grant', {
      ownerAddress: owner,
      metricId: 'mrr',
      viewerAddress: viewer2,
    });

    const response = await makeRequest('GET', `/metrics/access/${owner}/mrr`);
    assert.strictEqual(response.status, 200);
    assert(response.body.viewers.includes(viewer1.toLowerCase()));
    assert(response.body.viewers.includes(viewer2.toLowerCase()));
  });

  test('POST /metrics/access/grant - should handle multiple metrics independently', async () => {
    const owner = '0x1234567890123456789012345678901234567890';
    const viewer = '0x9876543210987654321098765432109876543210';

    await makeRequest('POST', '/metrics/access/grant', {
      ownerAddress: owner,
      metricId: 'mrr',
      viewerAddress: viewer,
    });

    await makeRequest('POST', '/metrics/access/grant', {
      ownerAddress: owner,
      metricId: 'dau',
      viewerAddress: viewer,
    });

    const response1 = await makeRequest('GET', `/metrics/access/${owner}/mrr`);
    const response2 = await makeRequest('GET', `/metrics/access/${owner}/dau`);

    assert.strictEqual(response1.status, 200);
    assert.strictEqual(response2.status, 200);
    assert(response1.body.viewers.includes(viewer.toLowerCase()));
    assert(response2.body.viewers.includes(viewer.toLowerCase()));
  });

  test('DELETE /metrics/meta/:ownerAddress/:metricId - should return 404 for non-existent metric', async () => {
    const owner = '0x1234567890123456789012345678901234567890';
    const response = await makeRequest('DELETE', `/metrics/meta/${owner}/nonexistent`);

    assert.strictEqual(response.status, 404);
  });

  test('GET /health - should return health status', async () => {
    const response = await makeRequest('GET', '/health');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.status, 'ok');
    assert.strictEqual(response.body.service, 'fhe-kpi-vault-backend');
  });
});

// Simple test runner
async function runTests() {
  const beforeAllFns = tests.filter(t => t.type === 'beforeAll').map(t => t.fn);
  const afterAllFns = tests.filter(t => t.type === 'afterAll').map(t => t.fn);
  const beforeEachFns = tests.filter(t => t.type === 'beforeEach').map(t => t.fn);
  const afterEachFns = tests.filter(t => t.type === 'afterEach').map(t => t.fn);
  const testFns = tests.filter(t => !t.type);

  let passed = 0;
  let failed = 0;

  // Run beforeAll
  for (const fn of beforeAllFns) {
    await fn();
  }

  // Run tests
  for (const test of testFns) {
    try {
      // Run beforeEach
      for (const fn of beforeEachFns) {
        await fn();
      }

      await test.fn();
      console.log(`✓ ${test.name}`);
      passed++;

      // Run afterEach
      for (const fn of afterEachFns) {
        await fn();
      }
    } catch (error) {
      console.error(`✗ ${test.name}`);
      console.error(`  ${error.message}`);
      failed++;

      // Run afterEach even on failure
      for (const fn of afterEachFns) {
        try {
          await fn();
        } catch (e) {
          // Ignore afterEach errors
        }
      }
    }
  }

  // Run afterAll
  for (const fn of afterAllFns) {
    try {
      await fn();
    } catch (e) {
      // Ignore afterAll errors
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// Export for use
export { test, beforeAll, afterAll, beforeEach, afterEach, makeRequest };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

