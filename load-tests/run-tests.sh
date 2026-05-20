#!/usr/bin/env bash
# =============================================================================
# TaskFlow – Load Test Runner
# =============================================================================
# Usage:
#   bash load-tests/run-tests.sh [--scenario frontend|data|all]
#
# Options:
#   --scenario frontend   Run only the 5 frontend scenarios
#   --scenario data       Run only the 7 data-endpoint scenarios
#   --scenario all        Run all 12 scenarios (default)
#
# Prerequisites:
#   - k6 installed and available on PATH  (https://k6.io/docs/getting-started/installation/)
#   - Docker Compose stack is running     (docker compose up -d)
#
# Results are written to load-tests/results/ as JSON summary files.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'

# ---------------------------------------------------------------------------
# Check k6 is installed
# ---------------------------------------------------------------------------
if ! command -v k6 &>/dev/null; then
  echo -e "${RED}ERROR: k6 is not installed or not on PATH.${NC}"
  echo ""
  echo "Install k6:"
  echo "  Linux (Debian/Ubuntu):"
  echo "    sudo gpg -k"
  echo "    sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \\"
  echo "         --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69"
  echo "    echo 'deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main' \\"
  echo "         | sudo tee /etc/apt/sources.list.d/k6.list"
  echo "    sudo apt-get update && sudo apt-get install k6"
  echo ""
  echo "  macOS:"
  echo "    brew install k6"
  echo ""
  echo "  Windows (winget):"
  echo "    winget install k6 --source winget"
  echo ""
  echo "  Windows (Chocolatey):"
  echo "    choco install k6"
  echo ""
  echo "  Docker (no local install needed):"
  echo "    docker run --rm -i grafana/k6 run --insecure-skip-tls-verify - <load-tests/frontend-tests.js"
  echo ""
  echo "See: https://k6.io/docs/getting-started/installation/"
  exit 1
fi

echo -e "${GREEN}k6 $(k6 version) found.${NC}"

# ---------------------------------------------------------------------------
# Directories
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results"
mkdir -p "${RESULTS_DIR}"

# Timestamp for this test run
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
SCENARIO_GROUP="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario)
      SCENARIO_GROUP="${2:-all}"
      shift 2
      ;;
    --help|-h)
      echo "Usage: bash load-tests/run-tests.sh [--scenario frontend|data|all]"
      exit 0
      ;;
    *)
      echo -e "${YELLOW}Unknown argument: $1${NC}"
      shift
      ;;
  esac
done

# Validate scenario group
case "${SCENARIO_GROUP}" in
  frontend|data|all) ;;
  *)
    echo -e "${RED}Invalid --scenario value '${SCENARIO_GROUP}'. Use: frontend | data | all${NC}"
    exit 1
    ;;
esac

echo -e "${CYAN}=== TaskFlow Load Test Runner ===${NC}"
echo "Scenario group : ${SCENARIO_GROUP}"
echo "Results dir    : ${RESULTS_DIR}"
echo "Run timestamp  : ${TIMESTAMP}"
echo ""

# ---------------------------------------------------------------------------
# Helper: run a single k6 test for one scenario tag
# ---------------------------------------------------------------------------
run_scenario() {
  local script="$1"       # path to .js file (relative to project root)
  local scenario_tag="$2" # e.g. scenario1
  local label="$3"        # human-readable label for output

  local result_file="${RESULTS_DIR}/${TIMESTAMP}_${scenario_tag}.json"

  echo -e "${CYAN}--- Running: ${label} ---${NC}"
  echo "    Script  : ${script}"
  echo "    Scenario: ${scenario_tag}"
  echo "    Output  : ${result_file}"
  echo ""

  k6 run \
    --insecure-skip-tls-verify \
    --out json="${result_file}" \
    -e SCENARIO="${scenario_tag}" \
    --env SCENARIO="${scenario_tag}" \
    "${SCRIPT_DIR}/../${script}" \
    2>&1 | tee "${RESULTS_DIR}/${TIMESTAMP}_${scenario_tag}.log"

  local exit_code=$?
  if [[ ${exit_code} -eq 0 ]]; then
    echo -e "${GREEN}✓ ${label} PASSED${NC}"
  else
    echo -e "${RED}✗ ${label} FAILED (exit code ${exit_code})${NC}"
  fi
  echo ""
  return ${exit_code}
}

# ---------------------------------------------------------------------------
# Frontend test scenarios (5 scenarios)
# ---------------------------------------------------------------------------
run_frontend_tests() {
  echo -e "${CYAN}=============================="
  echo -e " FRONTEND TESTS (5 scenarios)"
  echo -e "==============================${NC}"
  echo ""

  run_scenario "load-tests/frontend-tests.js" "scenario1" "Frontend S1 – 10 VUs, 30 s"
  run_scenario "load-tests/frontend-tests.js" "scenario2" "Frontend S2 – 100 VUs, 1 s ramp, 30 s"
  run_scenario "load-tests/frontend-tests.js" "scenario3" "Frontend S3 – 1 000 VUs, 5 s ramp, 30 s"
  run_scenario "load-tests/frontend-tests.js" "scenario4" "Frontend S4 – 1 000 VUs, 1 s ramp, 30 s (stress)"
  run_scenario "load-tests/frontend-tests.js" "scenario5" "Frontend S5 – 1 000 req/min constant arrival, 10 min"
}

# ---------------------------------------------------------------------------
# Data endpoint test scenarios (7 scenarios)
# ---------------------------------------------------------------------------
run_data_tests() {
  echo -e "${CYAN}================================="
  echo -e " DATA ENDPOINT TESTS (7 scenarios)"
  echo -e "=================================${NC}"
  echo ""

  run_scenario "load-tests/data-endpoint-tests.js" "scenario1" "Data S1 – 10 VUs, normal body, 30 s"
  run_scenario "load-tests/data-endpoint-tests.js" "scenario2" "Data S2 – 100 VUs, 1 s ramp, normal body, 30 s"
  run_scenario "load-tests/data-endpoint-tests.js" "scenario3" "Data S3 – 1 000 VUs, 5 s ramp, normal body, 30 s"
  run_scenario "load-tests/data-endpoint-tests.js" "scenario4" "Data S4 – 10 VUs, 5 MB body, 30 s"
  run_scenario "load-tests/data-endpoint-tests.js" "scenario5" "Data S5 – 100 VUs, 1 s ramp, 5 MB body, 30 s"
  run_scenario "load-tests/data-endpoint-tests.js" "scenario6" "Data S6 – 1 000 VUs, 5 s ramp, 5 MB body (overload – 429 ok)"
  run_scenario "load-tests/data-endpoint-tests.js" "scenario7" "Data S7 – 1 000 VUs, 5 s ramp, 5 MB body, graceful stop"
}

# ---------------------------------------------------------------------------
# Execute selected group
# ---------------------------------------------------------------------------
overall_start=$(date +%s)

case "${SCENARIO_GROUP}" in
  frontend) run_frontend_tests ;;
  data)     run_data_tests ;;
  all)
    run_frontend_tests
    run_data_tests
    ;;
esac

overall_end=$(date +%s)
elapsed=$(( overall_end - overall_start ))

echo -e "${GREEN}=== All requested tests completed in ${elapsed}s ===${NC}"
echo "Results saved in: ${RESULTS_DIR}/"
echo ""
echo "Tip: Open Grafana at http://localhost:3000 to view live metrics."
echo "     Default credentials are in .secrets/grafana_password"
