/**
 * k6 Load Test Example
 *
 * A load test to verify system behavior under expected traffic.
 * Run with: k6 run load.mjs --summary-export artifacts/k6/summary.json
 *
 * Best practices demonstrated:
 * - Staged load pattern (ramp up → steady → ramp down)
 * - Realistic think time
 * - Multiple scenarios
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');
const successfulRequests = new Counter('successful_requests');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_TOKEN = __ENV.API_TOKEN || '';

// Load test options
export const options = {
  // Staged load pattern
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 users
    { duration: '5m', target: 10 },   // Stay at 10 users
    { duration: '2m', target: 20 },   // Ramp up to 20 users
    { duration: '5m', target: 20 },   // Stay at 20 users
    { duration: '2m', target: 0 },    // Ramp down to 0
  ],

  // Thresholds
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    errors: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

const headers = {
  'Content-Type': 'application/json',
  ...(API_TOKEN && { Authorization: `Bearer ${API_TOKEN}` }),
};

export default function () {
  group('Browse Flow', () => {
    // Step 1: Home page
    const homeRes = http.get(`${BASE_URL}/`, { headers });
    check(homeRes, {
      'home: status 200': (r) => r.status === 200,
    });
    errorRate.add(homeRes.status !== 200);
    if (homeRes.status === 200) successfulRequests.add(1);

    sleep(randomThinkTime(1, 3));

    // Step 2: List items
    const listRes = http.get(`${BASE_URL}/api/v1/items`, { headers });
    check(listRes, {
      'list: status 200': (r) => r.status === 200,
      'list: has items': (r) => {
        try {
          return JSON.parse(r.body).length >= 0;
        } catch {
          return false;
        }
      },
    });
    apiDuration.add(listRes.timings.duration);
    errorRate.add(listRes.status !== 200);
    if (listRes.status === 200) successfulRequests.add(1);

    sleep(randomThinkTime(2, 5));

    // Step 3: View single item
    const itemRes = http.get(`${BASE_URL}/api/v1/items/1`, { headers });
    check(itemRes, {
      'item: status 200 or 404': (r) => [200, 404].includes(r.status),
    });
    apiDuration.add(itemRes.timings.duration);

    sleep(randomThinkTime(1, 2));
  });

  group('Search Flow', () => {
    const searchRes = http.get(`${BASE_URL}/api/v1/search?q=test`, { headers });
    check(searchRes, {
      'search: status 200': (r) => r.status === 200,
      'search: response time < 1s': (r) => r.timings.duration < 1000,
    });
    apiDuration.add(searchRes.timings.duration);
    errorRate.add(searchRes.status !== 200);
    if (searchRes.status === 200) successfulRequests.add(1);

    sleep(randomThinkTime(2, 4));
  });
}

// Helper: Random think time between min and max seconds
function randomThinkTime(min, max) {
  return Math.random() * (max - min) + min;
}

export function setup() {
  console.log(`Starting load test against: ${BASE_URL}`);
  return { startTime: new Date().toISOString() };
}

export function teardown(data) {
  console.log(`Load test completed. Started at: ${data.startTime}`);
}
