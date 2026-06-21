/**
 * GitHub Profile Analyzer — API Integration Tests
 *
 * Self-contained test runner using ONLY the built-in Node.js `http` module.
 * No test frameworks (Jest, Mocha, etc.) required.
 *
 * Usage:
 *   node tests/api.test.js
 */

require('dotenv').config();
const http = require('http');

// Import the app and server from our application
const { app, server } = require('../src/app');

// ----- Helpers -----

/**
 * Make an HTTP request and return { status, body } as a Promise.
 */
function request(method, path, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const port = server.address() ? server.address().port : null;
    if (!port) {
      return reject(new Error('Server is not listening — cannot determine port.'));
    }

    const options = {
      hostname: 'localhost',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeout}ms: ${method} ${path}`));
    }, timeout);

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        clearTimeout(timer);
        let body = null;
        try {
          body = JSON.parse(data);
        } catch (e) {
          body = data;
        }
        resolve({ status: res.statusCode, body });
      });
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    req.end();
  });
}

/**
 * Wait for the server to be ready.
 */
function waitForServer() {
  return new Promise((resolve) => {
    if (server.listening) {
      return resolve();
    }
    server.on('listening', () => resolve());
    // Fallback timeout in case the event was already emitted
    setTimeout(resolve, 2000);
  });
}

// ----- Test Runner -----

let passed = 0;
let failed = 0;
const total = 10;

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${testName}`);
  }
}

async function runTests() {
  console.log('\n🧪 GitHub Profile Analyzer — API Tests\n');
  console.log('Waiting for server to be ready...');
  await waitForServer();
  const port = server.address() ? server.address().port : 'unknown';
  console.log(`Server is listening on port ${port}\n`);

  // -------------------------------------------------------
  // TEST 1: Health check
  // -------------------------------------------------------
  try {
    const res = await request('GET', '/health', 5000);
    assert(
      res.status === 200 && res.body && res.body.status === 'ok',
      'GET /health → 200, status === "ok"'
    );
  } catch (err) {
    failed++;
    console.log(`  ❌ FAIL: GET /health — ${err.message}`);
  }

  // -------------------------------------------------------
  // TEST 2: Analyze torvalds
  // -------------------------------------------------------
  try {
    const res = await request('POST', '/api/profiles/analyze/torvalds', 30000);
    assert(
      res.status === 200 && res.body && res.body.success === true,
      'POST /api/profiles/analyze/torvalds → 200, success === true'
    );
  } catch (err) {
    failed++;
    console.log(`  ❌ FAIL: POST /api/profiles/analyze/torvalds — ${err.message}`);
  }

  // -------------------------------------------------------
  // TEST 3: List all profiles
  // -------------------------------------------------------
  try {
    const res = await request('GET', '/api/profiles', 5000);
    assert(
      res.status === 200 &&
      res.body &&
      res.body.success === true &&
      Array.isArray(res.body.data) &&
      res.body.data.length >= 1,
      'GET /api/profiles → 200, returns array with >= 1 profile'
    );
  } catch (err) {
    failed++;
    console.log(`  ❌ FAIL: GET /api/profiles — ${err.message}`);
  }

  // -------------------------------------------------------
  // TEST 4: Get single profile (torvalds)
  // -------------------------------------------------------
  try {
    const res = await request('GET', '/api/profiles/torvalds', 5000);
    assert(
      res.status === 200 &&
      res.body &&
      res.body.data &&
      res.body.data.username === 'torvalds' &&
      typeof res.body.data.activity_score === 'number',
      'GET /api/profiles/torvalds → 200, username === "torvalds", activity_score is number'
    );
  } catch (err) {
    failed++;
    console.log(`  ❌ FAIL: GET /api/profiles/torvalds — ${err.message}`);
  }

  // -------------------------------------------------------
  // TEST 5: Re-analyze torvalds (should return cached)
  // -------------------------------------------------------
  try {
    const res = await request('POST', '/api/profiles/analyze/torvalds', 15000);
    assert(
      res.status === 200 && res.body && res.body.cached === true,
      'POST /api/profiles/analyze/torvalds (no force) → 200, cached === true'
    );
  } catch (err) {
    failed++;
    console.log(`  ❌ FAIL: POST /api/profiles/analyze/torvalds (cached) — ${err.message}`);
  }

  // -------------------------------------------------------
  // TEST 6: Get nonexistent profile → 404
  // -------------------------------------------------------
  try {
    const res = await request('GET', '/api/profiles/nonexistent_user_xyzabc', 5000);
    assert(
      res.status === 404,
      'GET /api/profiles/nonexistent_user_xyzabc → 404'
    );
  } catch (err) {
    failed++;
    console.log(`  ❌ FAIL: GET /api/profiles/nonexistent_user_xyzabc — ${err.message}`);
  }

  // -------------------------------------------------------
  // TEST 7: Analyze invalid username → 400
  // -------------------------------------------------------
  try {
    const res = await request('POST', '/api/profiles/analyze/invalid--username!!', 5000);
    assert(
      res.status === 400,
      'POST /api/profiles/analyze/invalid--username!! → 400'
    );
  } catch (err) {
    failed++;
    console.log(`  ❌ FAIL: POST /api/profiles/analyze/invalid--username!! — ${err.message}`);
  }

  // -------------------------------------------------------
  // TEST 8: Analyze gaearon, then compare torvalds & gaearon
  // -------------------------------------------------------
  try {
    // Ensure gaearon is analyzed first
    await request('POST', '/api/profiles/analyze/gaearon', 30000);
    const res = await request('GET', '/api/profiles/compare?users=torvalds,gaearon', 5000);
    assert(
      res.status === 200 && res.body && res.body.success === true,
      'GET /api/profiles/compare?users=torvalds,gaearon → 200, success === true'
    );
  } catch (err) {
    failed++;
    console.log(`  ❌ FAIL: Compare torvalds & gaearon — ${err.message}`);
  }

  // -------------------------------------------------------
  // TEST 9: Delete gaearon
  // -------------------------------------------------------
  try {
    const res = await request('DELETE', '/api/profiles/gaearon', 5000);
    assert(
      res.status === 200 && res.body && res.body.success === true,
      'DELETE /api/profiles/gaearon → 200, success === true'
    );
  } catch (err) {
    failed++;
    console.log(`  ❌ FAIL: DELETE /api/profiles/gaearon — ${err.message}`);
  }

  // -------------------------------------------------------
  // TEST 10: Verify gaearon is deleted → 404
  // -------------------------------------------------------
  try {
    const res = await request('GET', '/api/profiles/gaearon', 5000);
    assert(
      res.status === 404,
      'GET /api/profiles/gaearon (after delete) → 404'
    );
  } catch (err) {
    failed++;
    console.log(`  ❌ FAIL: GET /api/profiles/gaearon (after delete) — ${err.message}`);
  }

  // -------------------------------------------------------
  // Summary
  // -------------------------------------------------------
  console.log('\n' + '─'.repeat(50));
  console.log(`📊 Results: ${passed}/${total} tests passed`);
  if (failed > 0) {
    console.log(`⚠️  ${failed} test(s) failed.`);
  } else {
    console.log('🎉 All tests passed!');
  }
  console.log('─'.repeat(50) + '\n');

  // Cleanup
  server.close(() => {
    process.exit(failed > 0 ? 1 : 0);
  });
}

// Run
runTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  server.close(() => process.exit(1));
});
