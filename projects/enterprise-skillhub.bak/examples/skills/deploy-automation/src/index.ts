/**
 * Deploy Automation — Automated deployment script generator
 *
 * Generates deployment configurations for:
 * - Docker Compose
 * - Kubernetes manifests
 * - CI/CD pipelines
 */

export type CloudProvider = 'aws' | 'gcp' | 'azure';
export type DeployTarget = 'docker-compose' | 'kubernetes' | 'ecs' | 'cloud-run';

export interface DeployConfig {
  appName: string;
  image: string;
  port: number;
  replicas?: number;
  env?: Record<string, string>;
  provider?: CloudProvider;
  target: DeployTarget;
  resources?: {
    cpu: string;
    memory: string;
  };
}

/**
 * Generate a Docker Compose configuration
 */
export function generateDockerCompose(config: DeployConfig): string {
  const envBlock = config.env
    ? Object.entries(config.env)
        .map(([k, v]) => `      - ${k}=${v}`)
        .join('\n')
    : '';

  return `version: '3.8'

services:
  ${config.appName}:
    image: ${config.image}
    ports:
      - "${config.port}:${config.port}"
    ${envBlock ? `environment:\n${envBlock}` : ''}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${config.port}/health"]
      interval: 30s
      timeout: 10s
      retries: 3
`;
}

/**
 * Generate Kubernetes Deployment + Service manifests
 */
export function generateK8sManifest(config: DeployConfig): string {
  const replicas = config.replicas || 2;
  const cpu = config.resources?.cpu || '250m';
  const memory = config.resources?.memory || '256Mi';

  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${config.appName}
  labels:
    app: ${config.appName}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${config.appName}
  template:
    metadata:
      labels:
        app: ${config.appName}
    spec:
      containers:
        - name: ${config.appName}
          image: ${config.image}
          ports:
            - containerPort: ${config.port}
          resources:
            requests:
              cpu: ${cpu}
              memory: ${memory}
            limits:
              cpu: ${cpu}
              memory: ${memory}
---
apiVersion: v1
kind: Service
metadata:
  name: ${config.appName}-svc
spec:
  selector:
    app: ${config.appName}
  ports:
    - port: 80
      targetPort: ${config.port}
  type: ClusterIP
`;
}

/**
 * Generate GitHub Actions CI/CD pipeline
 */
export function generateGitHubActions(config: DeployConfig): string {
  return `name: Deploy ${config.appName}

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -t ${config.image} .

      - name: Push to registry
        run: docker push ${config.image}

      - name: Deploy
        run: |
          echo "Deploying ${config.appName} to ${config.target}..."
`;
}
