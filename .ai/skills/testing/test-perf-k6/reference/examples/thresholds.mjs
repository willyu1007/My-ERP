/**
 * k6 Thresholds Reference
 *
 * Common threshold configurations for different scenarios.
 * Copy and adapt these to your test scripts.
 *
 * Threshold syntax:
 * - 'metricName': ['condition1', 'condition2']
 * - Conditions: p(N) (percentile), avg, min, max, med, rate, count
 */

// =============================================================================
// SMOKE TEST THRESHOLDS (Strict - system must be healthy)
// =============================================================================
export const smokeThresholds = {
  // Response time
  http_req_duration: [
    'p(95)<500',   // 95% of requests < 500ms
    'p(99)<1000',  // 99% of requests < 1s
  ],

  // Error rate
  http_req_failed: ['rate<0.01'],  // < 1% failure rate

  // Check pass rate
  checks: ['rate>0.99'],  // > 99% checks pass
};

// =============================================================================
// LOAD TEST THRESHOLDS (Moderate - acceptable under load)
// =============================================================================
export const loadThresholds = {
  http_req_duration: [
    'p(95)<1000',  // 95% < 1s
    'p(99)<2000',  // 99% < 2s
  ],

  http_req_failed: ['rate<0.05'],  // < 5% failure rate
  checks: ['rate>0.95'],           // > 95% checks pass
};

// =============================================================================
// STRESS TEST THRESHOLDS (Lenient - system under extreme load)
// =============================================================================
export const stressThresholds = {
  http_req_duration: [
    'p(95)<3000',  // 95% < 3s
    'p(99)<5000',  // 99% < 5s
  ],

  http_req_failed: ['rate<0.10'],  // < 10% failure rate
  checks: ['rate>0.90'],           // > 90% checks pass
};

// =============================================================================
// API-SPECIFIC THRESHOLDS
// =============================================================================
export const apiThresholds = {
  // Health check endpoint (must be fast)
  'http_req_duration{name:health}': ['p(99)<100'],

  // Read operations
  'http_req_duration{name:read}': ['p(95)<500'],

  // Write operations (can be slower)
  'http_req_duration{name:write}': ['p(95)<1000'],

  // Search operations
  'http_req_duration{name:search}': ['p(95)<2000'],
};

// =============================================================================
// SLO-BASED THRESHOLDS (Service Level Objectives)
// =============================================================================
export const sloThresholds = {
  // Availability: 99.9% uptime
  http_req_failed: ['rate<0.001'],

  // Latency SLO: p99 < 1s
  http_req_duration: ['p(99)<1000'],

  // Throughput: minimum requests per second
  // (Verify in handleSummary or external monitoring)
};

// =============================================================================
// USAGE EXAMPLE
// =============================================================================
/*
		import { smokeThresholds, apiThresholds } from './thresholds.mjs';

export const options = {
  vus: 10,
  duration: '5m',
  thresholds: {
    ...smokeThresholds,
    ...apiThresholds,
  },
};
*/

// =============================================================================
// CUSTOM METRIC THRESHOLDS
// =============================================================================
/*
import { Trend, Rate, Counter } from 'k6/metrics';

// Define custom metrics
const loginDuration = new Trend('login_duration');
const loginErrors = new Rate('login_errors');

// Add thresholds
export const options = {
  thresholds: {
    login_duration: ['p(95)<2000'],  // Login < 2s
    login_errors: ['rate<0.02'],     // < 2% login failures
  },
};

// Use in test
export default function() {
  const start = Date.now();
  const res = http.post('/api/auth/login', payload);
  loginDuration.add(Date.now() - start);
  loginErrors.add(res.status !== 200);
}
*/

// =============================================================================
// ABORT ON THRESHOLD BREACH
// =============================================================================
/*
export const options = {
  thresholds: {
    http_req_failed: [
      {
        threshold: 'rate<0.10',
        abortOnFail: true,        // Stop test if exceeded
        delayAbortEval: '10s',    // Wait 10s before evaluating
      },
    ],
  },
};
*/
