#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────────
# generate-cert.sh  –  Generates a self-signed TLS certificate for localhost
#
# Usage:
#   chmod +x reverse-proxy/certs/generate-cert.sh
#   ./reverse-proxy/certs/generate-cert.sh
#
# Output:
#   reverse-proxy/certs/localhost.crt  (certificate, mounted into reverse-proxy)
#   reverse-proxy/certs/localhost.key  (private key,  mounted into reverse-proxy)
#
# To regenerate: simply run this script again. The old files will be replaced.
# Note: Browsers will show a security warning for self-signed certificates.
#       Use -k / --insecure in curl, or add an exception in the browser.
# ──────────────────────────────────────────────────────────────────────────────

CERT_DIR="$(dirname "$0")"
CERT_FILE="$CERT_DIR/localhost.crt"
KEY_FILE="$CERT_DIR/localhost.key"

echo "[cert] Generating self-signed certificate..."

openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout "$KEY_FILE" \
  -out "$CERT_FILE" \
  -subj "/C=DE/ST=Berlin/L=Berlin/O=HTW/OU=IT-Infrastrukturen/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

if [ $? -eq 0 ]; then
  echo "[cert] Done!"
  echo "  Certificate: $CERT_FILE"
  echo "  Private key: $KEY_FILE"
  echo ""
  echo "  Fingerprint:"
  openssl x509 -noout -fingerprint -sha256 -in "$CERT_FILE"
else
  echo "[cert] ERROR: Certificate generation failed. Is openssl installed?"
  exit 1
fi
