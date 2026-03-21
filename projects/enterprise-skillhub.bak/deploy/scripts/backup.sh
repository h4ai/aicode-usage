#!/usr/bin/env bash
########################################################
# Enterprise SkillHub — Manual Backup Script
# Creates PG dump and uploads to MinIO
########################################################
set -euo pipefail

NAMESPACE="skillhub"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="skillhub_manual_${TIMESTAMP}.sql.gz"
LOCAL_PATH="/tmp/${BACKUP_NAME}"

echo "💾 Enterprise SkillHub — Manual Backup"
echo "======================================="
echo "Timestamp: ${TIMESTAMP}"
echo ""

# Step 1: Get PG pod
PG_POD=$(kubectl get pod -n "${NAMESPACE}" -l app=skillhub-postgres -o jsonpath='{.items[0].metadata.name}')
echo "📎 PostgreSQL pod: ${PG_POD}"

# Step 2: Create backup inside pod
echo "📦 Creating database dump..."
kubectl exec -n "${NAMESPACE}" "${PG_POD}" -- sh -c \
  "PGPASSWORD=\${POSTGRES_PASSWORD} pg_dump -U skillhub -d skillhub --no-owner --no-privileges | gzip" \
  > "${LOCAL_PATH}"

BACKUP_SIZE=$(du -h "${LOCAL_PATH}" | cut -f1)
echo "   Created: ${LOCAL_PATH} (${BACKUP_SIZE})"

# Step 3: Upload to MinIO (via port-forward)
echo "📤 Uploading to MinIO..."
MINIO_POD=$(kubectl get pod -n "${NAMESPACE}" -l app=skillhub-minio -o jsonpath='{.items[0].metadata.name}')

# Copy backup to MinIO pod, then use mc to move it
kubectl cp "${LOCAL_PATH}" "${NAMESPACE}/${MINIO_POD}:/tmp/${BACKUP_NAME}"
kubectl exec -n "${NAMESPACE}" "${MINIO_POD}" -- sh -c \
  "mc alias set local http://localhost:9000 \${MINIO_ROOT_USER} \${MINIO_ROOT_PASSWORD} && \
   mc mb --ignore-existing local/skillhub-backups/postgres/ && \
   mc cp /tmp/${BACKUP_NAME} local/skillhub-backups/postgres/ && \
   rm /tmp/${BACKUP_NAME}"

echo ""
echo "✅ Backup complete!"
echo "   File: skillhub-backups/postgres/${BACKUP_NAME}"
echo "   Size: ${BACKUP_SIZE}"
echo ""
echo "🔄 To restore:"
echo "   1. Download: mc cp backup/skillhub-backups/postgres/${BACKUP_NAME} /tmp/"
echo "   2. Restore:  gunzip -c /tmp/${BACKUP_NAME} | psql -h <PG_HOST> -U skillhub -d skillhub"

# Cleanup local
rm -f "${LOCAL_PATH}"
