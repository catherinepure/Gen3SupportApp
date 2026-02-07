#!/bin/bash
# Simple HTTP server for testing web-admin locally
# Usage: ./serve.sh

echo "Starting web server on http://localhost:8000"
echo "Press Ctrl+C to stop"
echo ""

cd "$(dirname "$0")"
python3 -m http.server 8000
