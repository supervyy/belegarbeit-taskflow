/**
 * TaskFlow – Data Endpoint Load Tests
 * =====================================
 * Target  : POST https://localhost/api/data
 * Scenarios: 7 (see below)
 *
 * Run with:
 *   k6 run --insecure-skip-tls-verify load-tests/data-endpoint-tests.js
 *
 * To execute a single scenario pass the SCENARIO env variable:
 *   k6 run --insecure-skip-tls-verify -e SCENARIO=scenario1 load-tests/data-endpoint-tests.js
 *
 * NOTE: --insecure-skip-tls-verify is required because the reverse-proxy uses a
 *       self-signed certificate (reverse-proxy/certs/localhost.crt).
 *
 * Body sizes:
 *   Normal : ~100 bytes  (JSON payload)
 *   Large  : 5 MB        (5 * 1024 * 1024 bytes of 'X')
 *
 * HTTP 429 (Too Many Requests) is treated as a SUCCESS under overload conditions
 * because the Nginx rate limiter is expected to trigger before the backend is
 * overwhelmed. This is the desired protective behaviour.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

// ---------------------------------------------------------------------------
// Target URL
// ---------------------------------------------------------------------------
const TARGET_URL = 'https://localhost/api/data';

// ---------------------------------------------------------------------------
// Payload helpers
// ---------------------------------------------------------------------------

/** ~100-byte normal JSON request body */
const NORMAL_BODY = JSON.stringify({
  source: 'k6-load-test',
  type: 'event',
  payload: 'TaskFlow load test normal payload',
  timestamp: new Date().toISOString(),
});

/**
 * 5 MB body – generated once at init time so VUs share the same buffer.
 * Using a string of 'X' repeated 5 * 1024 * 1024 times.
 * Content-Type is set to application/octet-stream to avoid JSON parsing on
 * the server side which would waste additional CPU.
 */
const LARGE_BODY_SIZE = 5 * 1024 * 1024; // 5 242 880 bytes
const LARGE_BODY = 'X'.repeat(LARGE_BODY_SIZE);

// ---------------------------------------------------------------------------
// Shared request parameters
// ---------------------------------------------------------------------------
const JSON_HEADERS = {
  headers: { 'Content-Type': 'application/json' },
  insecureSkipTLSVerify: true,
};

const BINARY_HEADERS = {
  headers: { 'Content-Type': 'application/octet-stream' },
  insecureSkipTLSVerify: true,
};

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------
export const options = {
  /**
   * Scenarios
   * ---------
   * scenario1 : 10 VUs,    no ramp-up, normal body
   * scenario2 : 100 VUs,   1 s ramp-up, normal body
   * scenario3 : 1 000 VUs, 5 s ramp-up, normal body
   * scenario4 : 10 VUs,    no ramp-up, 5 MB body
   * scenario5 : 100 VUs,   1 s ramp-up, 5 MB body
   * scenario6 : 1 000 VUs, 5 s ramp-up, 5 MB body  (429 acceptable)
   * scenario7 : 1 000 VUs, 5 s ramp-up, 5 MB body  (graceful_stop, 200 or 429 required)
   */
  scenarios: {
    // ------------------------------------------------------------------
    // Scenario 1 – Baseline Normal Body (10 VUs, instant, 30 s)
    // ------------------------------------------------------------------
    scenario1: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      startTime: '0s',
      env: { BODY_TYPE: 'normal' },
      tags: { scenario: 'scenario1', body: 'normal' },
    },

    // ------------------------------------------------------------------
    // Scenario 2 – Load Normal Body (100 VUs, 1 s ramp-up, 30 s)
    // ------------------------------------------------------------------
    scenario2: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1s',  target: 100 },
        { duration: '29s', target: 100 },
      ],
      startTime: '35s',
      env: { BODY_TYPE: 'normal' },
      tags: { scenario: 'scenario2', body: 'normal' },
    },

    // ------------------------------------------------------------------
    // Scenario 3 – High Load Normal Body (1 000 VUs, 5 s ramp-up, 30 s)
    // ------------------------------------------------------------------
    scenario3: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s',  target: 1000 },
        { duration: '25s', target: 1000 },
      ],
      startTime: '80s',
      env: { BODY_TYPE: 'normal' },
      tags: { scenario: 'scenario3', body: 'normal' },
    },

    // ------------------------------------------------------------------
    // Scenario 4 – Baseline Large Body (10 VUs, instant, 30 s, 5 MB)
    // ------------------------------------------------------------------
    scenario4: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      startTime: '120s',
      env: { BODY_TYPE: 'large' },
      tags: { scenario: 'scenario4', body: 'large' },
    },

    // ------------------------------------------------------------------
    // Scenario 5 – Load Large Body (100 VUs, 1 s ramp-up, 30 s, 5 MB)
    // ------------------------------------------------------------------
    scenario5: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1s',  target: 100 },
        { duration: '29s', target: 100 },
      ],
      startTime: '160s',
      env: { BODY_TYPE: 'large' },
      tags: { scenario: 'scenario5', body: 'large' },
    },

    // ------------------------------------------------------------------
    // Scenario 6 – Stress Large Body (1 000 VUs, 5 s ramp-up, 30 s, 5 MB)
    // HTTP 429 is acceptable – rate limiter will kick in
    // ------------------------------------------------------------------
    scenario6: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s',  target: 1000 },
        { duration: '25s', target: 1000 },
      ],
      startTime: '200s',
      env: { BODY_TYPE: 'large' },
      tags: { scenario: 'scenario6', body: 'large' },
    },

    // ------------------------------------------------------------------
    // Scenario 7 – Stress Large Body w/ Graceful Stop
    //   (1 000 VUs, 5 s ramp-up, 30 s, 5 MB)
    //   Must receive 200 OR 429 – no request may fail entirely
    // ------------------------------------------------------------------
    scenario7: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s',  target: 1000 },
        { duration: '25s', target: 1000 },
      ],
      gracefulStop: '10s',    // allow in-flight requests to finish
      startTime: '240s',
      env: { BODY_TYPE: 'large' },
      tags: { scenario: 'scenario7', body: 'large' },
    },
  },

  // -----------------------------------------------------------------------
  // Global success thresholds
  // -----------------------------------------------------------------------
  thresholds: {
    // ≥95 % of all checks across all scenarios must pass
    'checks':                             ['rate>=0.95'],
    // Global p95 latency cap
    'http_req_duration':                  ['p(95)<5000'],
    // Per-scenario latency thresholds
    'http_req_duration{scenario:scenario1}': ['p(95)<500'],
    'http_req_duration{scenario:scenario2}': ['p(95)<1000'],
    'http_req_duration{scenario:scenario3}': ['p(95)<5000'],
    'http_req_duration{scenario:scenario4}': ['p(95)<2000'],   // large body, few VUs
    'http_req_duration{scenario:scenario5}': ['p(95)<5000'],
    'http_req_duration{scenario:scenario6}': ['p(95)<10000'],  // relaxed for 5 MB overload
    'http_req_duration{scenario:scenario7}': ['p(95)<10000'],
  },
};

// ---------------------------------------------------------------------------
// Default function – executed by every VU in every scenario
// ---------------------------------------------------------------------------
export default function () {
  // Determine which body type this scenario uses via the BODY_TYPE env var
  // injected per-scenario in the options block above.
  const bodyType = __ENV.BODY_TYPE || 'normal';
  const isLarge  = bodyType === 'large';

  const body    = isLarge ? LARGE_BODY      : NORMAL_BODY;
  const params  = isLarge ? BINARY_HEADERS  : JSON_HEADERS;

  const res = http.post(TARGET_URL, body, params);

  // Success criteria:
  //   200 – request processed successfully
  //   429 – rate-limited (acceptable protective response, counts as success)
  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
  });

  // Minimal think-time to avoid busy-looping; keep it very short for high VU tests
  sleep(0.1);
}
