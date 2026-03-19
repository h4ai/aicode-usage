#!/usr/bin/env bash
########################################################
# Enterprise SkillHub — One-click Deploy Script
########################################################
set -euo pipefail

NAMESPACE="skillhub"
REGISTRY="registry.internal.company.com/skillhub"
TAG="${1:-latest}"
DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "🚀 Enterprise SkillHub — Deployment"
echo "===================================="
echo "Registry: ${REGISTRY}"
echo "Tag: ${TAG}"
echo "Namespace: ${NAMESPACE}"
echo ""

# Step 1: Build and push Docker image
echo "📦 Step 1/5: Building Docker image..."
docker build \
  -f "${DEPLOY_DIR}/docker/Dockerfile" \
  -t "${REGISTRY}/backend:${TAG}" \
  "${DEPLOY_DIR}/.."

echo "📤 Pushing image..."
docker push "${REGISTRY}/backend:${TAG}"

# Step 2: Create namespace (idempotent)
echo "🏗️  Step 2/5: Ensuring namespace..."
kubectl apply -f "${DEPLOY_DIR}/k8s/namespace.yaml"

# Step 3: Apply secrets (must be sealed in prod)
echo "🔐 Step 3/5: Applying secrets..."
if [ -f "${DEPLOY_DIR}/k8s/sealed-secrets.yaml" ]; then
  kubectl apply -f "${DEPLOY_DIR}/k8s/sealed-secrets.yaml"
else
  echo "  ⚠️  No sealed-secrets.yaml found. Using template (dev only)."
  kubectl apply -f "${DEPLOY_DIR}/k8s/secrets.yaml"
fi

# Step 4: Apply all K8s resources via Kustomize
echo "☸️  Step 4/5: Applying Kubernetes resources..."
kubectl apply -k "${DEPLOY_DIR}/k8s/" --prune -l app.kubernetes.io/name=enterprise-skillhub

# Update image tag
kubectl set image deployment/skillhub-backend \
  backend="${REGISTRY}/backend:${TAG}" \
  -n "${NAMESPACE}"

# Step 5: Run database migration
echo "🗄️  Step 5/5: Running Prisma migrations..."
kubectl exec -n "${NAMESPACE}" \
  deployment/skillhub-backend -- \
  npx prisma migrate deploy

# Wait for rollout
echo ""
echo "⏳ Waiting for rollout to complete..."
kubectl rollout status deployment/skillhub-backend \
  -n "${NAMESPACE}" --timeout=300s

echo ""
echo "✅ Deployment complete!"
echo "   Backend: kubectl get pods -n ${NAMESPACE} -l app=skillhub-backend"
echo "   Ingress: kubectl get ingress -n ${NAMESPACE}"
echo ""

# Health check
echo "🏥 Running health check..."
bash "${DEPLOY_DIR}/scripts/health-check.sh"
