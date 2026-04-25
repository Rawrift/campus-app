#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8000}"

echo "[1/4] Health"
curl -fsS "$BASE_URL/health" | python3 -m json.tool

echo "[2/4] Courses"
curl -fsS "$BASE_URL/api/courses" | python3 -m json.tool

echo "[3/4] Tasks"
curl -fsS "$BASE_URL/api/tasks" | python3 -m json.tool

echo "[4/4] Issues"
curl -fsS "$BASE_URL/api/issues" | python3 -m json.tool

echo "Smoke test OK ✅"
