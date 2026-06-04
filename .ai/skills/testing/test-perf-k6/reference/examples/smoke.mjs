/**
 * k6 Smoke Test Example
 *
 * A minimal smoke test to verify system availability and basic performance.
 * Run with: k6 run smoke.mjs --summary-export artifacts/k6/summary.json
 *
 * Best practices demonstrated:
 * - Environment variables for configuration
 * - Explicit thresholds for CI gating
 * - Standard checks and metrics
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');

// Configuration from environment variables
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_TOKEN = __ENV.API_TOKEN || '';

// Test options
export const options = {
  // Smoke test: minimal load to verify system works
  vus: 1,
  duration: '30s',

  // Thresholds for CI gating (fail if not met)
  thresholds: {
    // 95th percentile response time < 500ms
    http_req_duration: ['p(95)<500'],

    // Error rate < 1%
    errors: ['rate<0.01'],

    // Custom API duration threshold
    api_duration: ['p(95)<300'],

    // Check pass rate > 99%
    checks: ['rate>0.99'],
  },
};

// Default headers
const headers = {
  'Content-Type': 'application/json',
  ...(API_TOKEN && { Authorization: `Bearer ${API_TOKEN}` }),
};

export default function () {
  // Test 1: Health endpoint
  const healthRes = http.get(`${BASE_URL}/api/health`, { headers });

  check(healthRes, {
    'health: status is 200': (r) => r.status === 200,
    'health: response has status field': (r) => {
      try {
        return JSON.parse(r.body).status === 'ok';
      } catch {
        return false;
      }
    },
  });

  errorRate.add(healthRes.status !== 200);
  apiDuration.add(healthRes.timings.duration);

  sleep(1);

  // Test 2: Main API endpoint
  const apiRes = http.get(`${BASE_URL}/api/v1/status`, { headers });

  check(apiRes, {
    'api: status is 200': (r) => r.status === 200,
    'api: response time < 500ms': (r) => r.timings.duration < 500,
  });

  errorRate.add(apiRes.status !== 200);
  apiDuration.add(apiRes.timings.duration);

  sleep(1);
}

// Setup function (runs once before all VUs)
export function setup() {
  console.log(`Starting smoke test against: ${BASE_URL}`);

  // Verify system is reachable
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    throw new Error(`System not reachable: ${res.status}`);
  }

  return { baseUrl: BASE_URL };
}

// Teardown function (runs once after all VUs complete)
export function teardown(data) {
  console.log(`Smoke test completed for: ${data.baseUrl}`);
}
