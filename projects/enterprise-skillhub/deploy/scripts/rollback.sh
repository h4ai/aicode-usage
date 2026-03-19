#!/usr/bin/env bash
########################################################
# Enterprise SkillHub — Rollback Script
########################################################
set -euo pipefail

NAMESPACE="skillhub"
REVISION="${1:-}"

echo "🔄 Enterprise SkillHub — Rollback"
echo "================================="

# Show rollout history
echo "📜 Deployment history:"
kubectl rollout history deployment/skillhub-backend -n "${NAMESPACE}"
echo ""

if [ -z "${REVISION}" ]; then
  # Rollback to previous version
  echo "↩️  Rolling back to previous version..."
  kubectl rollout undo deployment/skillhub-backend -n "${NAMESPACE}"
else
  # Rollback to specific revision
  echo "↩️  Rolling back to revision ${REVISION}..."
  kubectl rollout undo deployment/skillhub-backend \
    -n "${NAMESPACE}" --to-revision="${REVISION}"
fi

# Wait for rollout
echo ""
echo "⏳ Waiting for rollback to complete..."
kubectl rollout status deployment/skillhub-backend \
  -n "${NAMESPACE}" --timeout=300s

echo ""
echo "✅ Rollback complete!"
echo ""

# Verify
echo "📋 Current pods:"
kubectl get pods -n "${NAMESPACE}" -l app=skillhub-backend

echo ""
echo "🏥 Running health check..."
bash "$(dirname "$0")/health-check.sh"
