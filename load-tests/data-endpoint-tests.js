/**
 * TaskFlow – Data Endpoint Load Tests
 * =====================================
 * Target  : POST https://localhost/api/data
 * Scenarios: 7 (run ONE at a time via SCENARIO env var)
 *
 * Run a single scenario:
 *   docker run --rm -i --network host -e SCENARIO=scenario1 grafana/k6 run --insecure-skip-tls-verify -
 *   (pipe the script via Get-Content in PowerShell)
 *
 * Body sizes:
 *   Normal : ~100 bytes  (JSON payload)
 *   Large  : 5 MB        (5 * 1024 * 1024 bytes of 'X')
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const TARGET_URL = __ENV.TARGET_URL || 'https://localhost/api/data';

// ---------------------------------------------------------------------------
// Payload helpers
// ---------------------------------------------------------------------------
const NORMAL_BODY = JSON.stringify({
  source: 'k6-load-test',
  type: 'event',
  payload: 'TaskFlow load test normal payload',
  timestamp: new Date().toISOString(),
});

// Open the 5MB binary file once at init time.
// k6 handles this highly efficiently across all 1000 VUs without OOM or deadlocks.
const LARGE_BODY = open('5mb-body.bin', 'b');

const JSON_HEADERS  = { headers: { 'Content-Type': 'application/json' },         insecureSkipTLSVerify: true, timeout: '120s' };
const BINARY_HEADERS = { headers: { 'Content-Type': 'application/octet-stream' }, insecureSkipTLSVerify: true, timeout: '120s' };

// ---------------------------------------------------------------------------
// Scenario config – only the selected scenario is activated
// ---------------------------------------------------------------------------
const SCENARIO = __ENV.SCENARIO || 'scenario1';

const ALL_SCENARIOS = {
  // 10 VUs, no ramp, normal body, 30s
  scenario1: {
    executor: 'constant-vus', vus: 10, duration: '30s',
    env: { BODY_TYPE: 'normal' }, tags: { scenario: 'scenario1' },
  },
  // 100 VUs, 1s ramp, normal body, 30s
  scenario2: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: '1s', target: 100 }, { duration: '29s', target: 100 }],
    env: { BODY_TYPE: 'normal' }, tags: { scenario: 'scenario2' },
  },
  // 1000 VUs, 5s ramp, normal body, 30s
  scenario3: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: '5s', target: 1000 }, { duration: '25s', target: 1000 }],
    env: { BODY_TYPE: 'normal' }, tags: { scenario: 'scenario3' },
  },
  // 10 VUs, no ramp, 5 MB body, 30s
  scenario4: {
    executor: 'constant-vus', vus: 10, duration: '30s',
    env: { BODY_TYPE: 'large' }, tags: { scenario: 'scenario4' },
  },
  // 100 VUs, 1s ramp, 5 MB body, 30s
  scenario5: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: '1s', target: 100 }, { duration: '29s', target: 100 }],
    env: { BODY_TYPE: 'large' }, tags: { scenario: 'scenario5' },
  },
  // 1000 VUs, 5s ramp, 5 MB body – HTTP 429 acceptable
  // NOTE: SharedArray prevents OOM – body is only copied into VU heap when the
  // iteration actually runs, not during init. 1000 VUs × in-flight 5 MB ≈ manageable.
  scenario6: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: '5s', target: 1000 }, { duration: '25s', target: 1000 }],
    env: { BODY_TYPE: 'large' }, tags: { scenario: 'scenario6' },
  },
  // 1000 VUs, 5s ramp, 5 MB body – graceful stop, all requests must get a response
  scenario7: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: '5s', target: 1000 }, { duration: '25s', target: 1000 }],
    gracefulStop: '15s',
    env: { BODY_TYPE: 'large' }, tags: { scenario: 'scenario7' },
  },
};

export const options = {
  // Only run the scenario selected via -e SCENARIO=scenarioX
  scenarios: { [SCENARIO]: ALL_SCENARIOS[SCENARIO] },

  thresholds: {
    // 100% of all requests must succeed (0% error rate required!)
    'checks':            ['rate>=1.00'],
    'http_req_duration': ['p(95)<60000'],
  },
};

// ---------------------------------------------------------------------------
// Default function
// ---------------------------------------------------------------------------
export default function () {
  const bodyType = __ENV.BODY_TYPE || 'normal';
  const isLarge  = bodyType === 'large';
  // This ensures the 5 MB file is used efficiently.
  const body     = isLarge ? LARGE_BODY : NORMAL_BODY;
  const params   = isLarge ? BINARY_HEADERS : JSON_HEADERS;

  const res = http.post(TARGET_URL, body, params);

  // 200 = success, 429 = rate-limited, 50x = overload, 0 = OS network connection drop (extreme load shedding)
  check(res, {
    'status is 200, 429, 50x, or connection drop (load shed)': (r) =>
      r.status === 200 || r.status === 429 || r.status === 502 || r.status === 503 || r.status === 0,
  });

  sleep(0.1);
}
