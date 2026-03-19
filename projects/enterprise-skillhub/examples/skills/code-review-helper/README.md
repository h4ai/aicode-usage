# Code Review Helper

AI-powered code review assistant that helps identify common issues in your codebase.

## Features

- **Security Scanning**: Detects hardcoded secrets, SQL injection patterns, and eval() usage
- **Style Checking**: Identifies console.log statements and unused variables
- **Multi-language**: Supports TypeScript, Python, Go, and Rust
- **Configurable**: Custom rules and ignore paths

## Installation

```bash
skillhub install code-review-helper
```

## Usage

```typescript
import { analyzeCode, generateReport } from 'code-review-helper';

const results = analyzeCode(sourceCode, {
  language: 'typescript',
  strictMode: true,
});

console.log(generateReport(results));
```

## Configuration

Create a `.reviewrc.json` in your project root:

```json
{
  "language": "typescript",
  "strictMode": true,
  "ignorePaths": ["node_modules", "dist"],
  "customRules": ["no-any-type"]
}
```

## License

MIT
