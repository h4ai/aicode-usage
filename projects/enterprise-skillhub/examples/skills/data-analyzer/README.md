# Data Analyzer

Data analysis and visualization assistant with statistical insights.

## Features

- **Statistical Summary**: Mean, median, std deviation, percentiles
- **Trend Detection**: Linear regression with R² confidence
- **Data Quality**: Completeness scoring, duplicate detection
- **Visualization**: Chart type suggestions based on data shape

## Installation

```bash
skillhub install data-analyzer
```

## Quick Start

```typescript
import { calculateStats, detectTrend, assessDataQuality } from 'data-analyzer';

// Statistical summary
const stats = calculateStats([10, 20, 30, 40, 50]);
console.log(stats);
// { count: 5, mean: 30, median: 30, stdDev: 14.1421, ... }

// Trend detection
const trend = detectTrend([10, 15, 22, 28, 35]);
console.log(trend);
// { direction: 'up', slope: 6.2, confidence: 0.99 }

// Data quality
const quality = assessDataQuality([
  { name: 'revenue', type: 'number', values: [100, 200, null, 400] },
  { name: 'date', type: 'date', values: ['2024-01', '2024-02', '2024-03', '2024-04'] },
]);
console.log(quality.score); // 85
```

## License

MIT
