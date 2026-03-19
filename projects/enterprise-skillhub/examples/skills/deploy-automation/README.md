# Deploy Automation

Automated deployment script generator for multi-cloud environments.

## Features

- **Docker Compose**: Generate production-ready compose files
- **Kubernetes**: Create Deployment, Service, and Ingress manifests
- **CI/CD**: GitHub Actions and GitLab CI pipeline templates
- **Multi-Cloud**: Support for AWS ECS, GCP Cloud Run, Azure Container Apps

## Installation

```bash
skillhub install deploy-automation
```

## Quick Start

```typescript
import { generateK8sManifest, generateDockerCompose } from 'deploy-automation';

const config = {
  appName: 'my-api',
  image: 'registry.example.com/my-api:latest',
  port: 3000,
  replicas: 3,
  target: 'kubernetes' as const,
};

// Generate K8s manifests
console.log(generateK8sManifest(config));

// Or Docker Compose
console.log(generateDockerCompose(config));
```

## License

MIT
