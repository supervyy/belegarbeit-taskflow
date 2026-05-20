/**
 * TaskFlow – Frontend Load Tests
 * ================================
 * Target  : GET https://localhost/
 * Scenarios: 5 (see below)
 *
 * Run with:
 *   k6 run --insecure-skip-tls-verify load-tests/frontend-tests.js
 *
 * To execute a single scenario pass the SCENARIO env variable:
 *   k6 run --insecure-skip-tls-verify -e SCENARIO=scenario1 load-tests/frontend-tests.js
 *
 * NOTE: --insecure-skip-tls-verify is required because the reverse-proxy uses a
 *       self-signed certificate (reverse-proxy/certs/localhost.crt).
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

// ---------------------------------------------------------------------------
// Target URL
// ---------------------------------------------------------------------------
const TARGET_URL = 'https://localhost/';

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------
export const options = {
  /**
   * Scenarios
   * ---------
   * scenario1 : 10 VUs, no ramp-up, 30 s
   * scenario2 : 100 VUs, 1 s ramp-up, 30 s
   * scenario3 : 1 000 VUs, 5 s ramp-up, 30 s
   * scenario4 : 1 000 VUs, 1 s ramp-up, 30 s  (stress – fast ramp)
   * scenario5 : constant arrival rate of 1 000 req/min over 10 min
   */
  scenarios: {
    // ------------------------------------------------------------------
    // Scenario 1 – Baseline (10 VUs, instant start, 30 s)
    // ------------------------------------------------------------------
    scenario1: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      startTime: '0s',
      tags: { scenario: 'scenario1' },
    },

    // ------------------------------------------------------------------
    // Scenario 2 – Load (100 VUs, 1 s ramp-up, 30 s)
    // ------------------------------------------------------------------
    scenario2: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1s',  target: 100 },
        { duration: '29s', target: 100 },
      ],
      startTime: '35s',   // start after scenario1 + buffer
      tags: { scenario: 'scenario2' },
    },

    // ------------------------------------------------------------------
    // Scenario 3 – High Load (1 000 VUs, 5 s ramp-up, 30 s)
    // ------------------------------------------------------------------
    scenario3: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s',  target: 1000 },
        { duration: '25s', target: 1000 },
      ],
      startTime: '80s',   // start after scenario2 + buffer
      tags: { scenario: 'scenario3' },
    },

    // ------------------------------------------------------------------
    // Scenario 4 – Stress (1 000 VUs, 1 s ramp-up, 30 s)
    // ------------------------------------------------------------------
    scenario4: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1s',  target: 1000 },
        { duration: '29s', target: 1000 },
      ],
      startTime: '120s',  // start after scenario3 + buffer
      tags: { scenario: 'scenario4' },
    },

    // ------------------------------------------------------------------
    // Scenario 5 – Constant Arrival Rate (1 000 req/min for 10 min)
    // ------------------------------------------------------------------
    scenario5: {
      executor: 'constant-arrival-rate',
      rate: 1000,
      timeUnit: '1m',         // → ≈ 16.67 req/s
      duration: '10m',
      preAllocatedVUs: 50,    // pre-warm VU pool
      maxVUs: 200,            // allow burst headroom
      startTime: '160s',      // start after scenario4 + buffer
      tags: { scenario: 'scenario5' },
    },
  },

  // -----------------------------------------------------------------------
  // Global success thresholds (applied across ALL scenarios)
  // -----------------------------------------------------------------------
  thresholds: {
    // At least 95 % of all requests must succeed (HTTP 200 or 429)
    'checks':                    ['rate>=0.95'],
    // 95th-percentile response time must stay below 5 000 ms
    'http_req_duration':         ['p(95)<5000'],
    // Per-scenario thresholds (tag filtering)
    'http_req_duration{scenario:scenario1}': ['p(95)<500'],
    'http_req_duration{scenario:scenario2}': ['p(95)<1000'],
    'http_req_duration{scenario:scenario3}': ['p(95)<5000'],
    'http_req_duration{scenario:scenario4}': ['p(95)<5000'],
    'http_req_duration{scenario:scenario5}': ['p(95)<5000'],
  },
};

// ---------------------------------------------------------------------------
// Default function – executed by every VU in every scenario
// ---------------------------------------------------------------------------
export default function () {
  const params = {
    tags: { endpoint: 'frontend-root' },
    // Disable TLS certificate verification for self-signed cert.
    // Alternatively, pass --insecure-skip-tls-verify on the CLI.
    insecureSkipTLSVerify: true,
  };

  const res = http.get(TARGET_URL, params);

  // Success: 200 (OK) or 429 (Too Many Requests – rate limit is acceptable)
  check(res, {
    'status is 200 or 429': (r) =>
      r.status === 200 || r.status === 429,
    'response body not empty': (r) => r.body && r.body.length > 0,
  });

  // Brief think-time to model realistic browser behaviour
  sleep(0.5);
}
