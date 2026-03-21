#!/usr/bin/env bash
########################################################
# Enterprise SkillHub — Health Check Script
########################################################
set -euo pipefail

NAMESPACE="skillhub"
BACKEND_SVC="skillhub-backend"
PORT=3000
ERRORS=0

echo "🏥 Enterprise SkillHub — Health Check"
echo "======================================"

# Step 1: Check pod status
echo ""
echo "📋 Pod Status:"
kubectl get pods -n "${NAMESPACE}" -o wide
echo ""

# Step 2: Check backend pods
READY=$(kubectl get deployment "${BACKEND_SVC}" -n "${NAMESPACE}" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
DESIRED=$(kubectl get deployment "${BACKEND_SVC}" -n "${NAMESPACE}" \
  -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")

if [ "${READY}" = "${DESIRED}" ] && [ "${READY}" != "0" ]; then
  echo "✅ Backend: ${READY}/${DESIRED} pods ready"
else
  echo "❌ Backend: ${READY}/${DESIRED} pods ready"
  ERRORS=$((ERRORS + 1))
fi

# Step 3: Port-forward and check health endpoints
echo ""
echo "🔍 Health Endpoints:"

# Start port-forward in background
kubectl port-forward -n "${NAMESPACE}" "svc/${BACKEND_SVC}" 13000:${PORT} &>/dev/null &
PF_PID=$!
sleep 3

# Liveness
LIVE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:13000/api/v1/health/live 2>/dev/null || echo "000")
if [ "${LIVE_STATUS}" = "200" ]; then
  echo "✅ Liveness  (/api/v1/health/live):  ${LIVE_STATUS}"
else
  echo "❌ Liveness  (/api/v1/health/live):  ${LIVE_STATUS}"
  ERRORS=$((ERRORS + 1))
fi

# Readiness
READY_RESPONSE=$(curl -s http://localhost:13000/api/v1/health/ready 2>/dev/null || echo '{"status":"error"}')
READY_STATUS=$(echo "${READY_RESPONSE}" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "${READY_STATUS}" = "ok" ]; then
  echo "✅ Readiness (/api/v1/health/ready): ${READY_STATUS}"
else
  echo "❌ Readiness (/api/v1/health/ready): ${READY_STATUS}"
  echo "   Response: ${READY_RESPONSE}"
  ERRORS=$((ERRORS + 1))
fi

# Metrics
METRICS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:13000/api/v1/metrics 2>/dev/null || echo "000")
if [ "${METRICS_STATUS}" = "200" ]; then
  echo "✅ Metrics   (/api/v1/metrics):      ${METRICS_STATUS}"
else
  echo "⚠️  Metrics   (/api/v1/metrics):      ${METRICS_STATUS}"
fi

# Cleanup port-forward
kill ${PF_PID} 2>/dev/null || true
wait ${PF_PID} 2>/dev/null || true

# Step 4: Check stateful services
echo ""
echo "🗄️  Stateful Services:"

for svc in postgres minio redis bge-m3; do
  POD_COUNT=$(kubectl get pods -n "${NAMESPACE}" -l "app=skillhub-${svc}" \
    --field-selector=status.phase=Running -o name 2>/dev/null | wc -l)
  if [ "${POD_COUNT}" -gt 0 ]; then
    echo "✅ ${svc}: ${POD_COUNT} pod(s) running"
  else
    echo "❌ ${svc}: no running pods"
    ERRORS=$((ERRORS + 1))
  fi
done

# Summary
echo ""
echo "======================================"
if [ ${ERRORS} -eq 0 ]; then
  echo "✅ All checks passed!"
  exit 0
else
  echo "❌ ${ERRORS} check(s) failed!"
  exit 1
fi
