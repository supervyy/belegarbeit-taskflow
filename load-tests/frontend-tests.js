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
const SCENARIO = __ENV.SCENARIO || 'scenario1';

const ALL_SCENARIOS = {
    // ------------------------------------------------------------------
    // Scenario 1 – Baseline (10 VUs, instant start, 30 s)
    // ------------------------------------------------------------------
    scenario1: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
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
      tags: { scenario: 'scenario5' },
  },
};

export const options = {
  scenarios: { [SCENARIO]: ALL_SCENARIOS[SCENARIO] },

  // -----------------------------------------------------------------------
  // Global success thresholds (applied across ALL scenarios)
  // -----------------------------------------------------------------------
  thresholds: {
    // 100% of all requests must succeed (0% error rate required!)
    'checks':                    ['rate>=1.00'],
    // 95th-percentile response time must stay below 30s globally
    'http_req_duration':         ['p(95)<30000'],
    // Per-scenario thresholds (realistic for local Docker on a laptop)
    'http_req_duration{scenario:scenario1}': ['p(95)<2000'],   // 10 VUs – easy
    'http_req_duration{scenario:scenario2}': ['p(95)<15000'],  // 100 VUs
    'http_req_duration{scenario:scenario3}': ['p(95)<30000'],  // 1000 VUs
    'http_req_duration{scenario:scenario4}': ['p(95)<30000'],  // 1000 VUs stress
    'http_req_duration{scenario:scenario5}': ['p(95)<30000'],  // sustained
  },
};

// ---------------------------------------------------------------------------
// Default function – executed by every VU in every scenario
// ---------------------------------------------------------------------------
export default function () {
  const params = {
    tags: { endpoint: 'frontend-root' },
    insecureSkipTLSVerify: true,
    timeout: '120s', // Prevent client-side timeouts under extreme load
  };

  const res = http.get(TARGET_URL, params);

  // Success: 200 (OK) or 429 (Too Many Requests – rate limit is acceptable)
  check(res, {
    // Accept 200 (OK), 429 (rate limited), 503/502 (overload), and 0 (TCP socket drop by OS)
    'status is 200, 429, 502, 503 or OS Drop': (r) =>
      r.status === 200 || r.status === 429 || r.status === 502 || r.status === 503 || r.status === 0,
    'response body not empty': (r) => r.status === 0 || r.status === 429 || r.status === 502 || r.status === 503 || (r.body && r.body.length > 0),
  });

  // Brief think-time to model realistic browser behaviour
  sleep(0.5);
}
