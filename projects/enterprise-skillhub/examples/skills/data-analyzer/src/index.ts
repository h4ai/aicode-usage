/**
 * Data Analyzer — Data analysis and visualization assistant
 *
 * Features:
 * - Statistical summaries
 * - Trend detection
 * - Data quality scoring
 * - Visualization suggestions
 */

export interface DataColumn {
  name: string;
  type: 'number' | 'string' | 'date' | 'boolean';
  values: any[];
}

export interface StatsSummary {
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
  nullCount: number;
}

export interface DataQualityReport {
  totalRows: number;
  totalColumns: number;
  completeness: number; // 0-1
  duplicateRows: number;
  issues: string[];
  score: number; // 0-100
}

/**
 * Calculate statistical summary for a numeric column
 */
export function calculateStats(values: number[]): StatsSummary {
  const clean = values.filter((v) => v !== null && v !== undefined && !isNaN(v));
  const nullCount = values.length - clean.length;

  if (clean.length === 0) {
    return {
      count: 0, mean: 0, median: 0, stdDev: 0,
      min: 0, max: 0, p25: 0, p75: 0, nullCount,
    };
  }

  const sorted = [...clean].sort((a, b) => a - b);
  const sum = clean.reduce((a, b) => a + b, 0);
  const mean = sum / clean.length;
  const variance = clean.reduce((acc, v) => acc + (v - mean) ** 2, 0) / clean.length;

  return {
    count: clean.length,
    mean: round(mean),
    median: round(percentile(sorted, 50)),
    stdDev: round(Math.sqrt(variance)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p25: round(percentile(sorted, 25)),
    p75: round(percentile(sorted, 75)),
    nullCount,
  };
}

/**
 * Assess data quality and return a report
 */
export function assessDataQuality(columns: DataColumn[]): DataQualityReport {
  const totalRows = columns[0]?.values.length || 0;
  const totalColumns = columns.length;
  const issues: string[] = [];

  // Check completeness
  let totalCells = 0;
  let nullCells = 0;
  for (const col of columns) {
    for (const val of col.values) {
      totalCells++;
      if (val === null || val === undefined || val === '') {
        nullCells++;
      }
    }
  }
  const completeness = totalCells > 0 ? (totalCells - nullCells) / totalCells : 0;

  if (completeness < 0.9) {
    issues.push(`Low completeness: ${(completeness * 100).toFixed(1)}%`);
  }

  // Check for duplicate rows (simplified)
  const rowStrings = new Set<string>();
  let duplicateRows = 0;
  for (let i = 0; i < totalRows; i++) {
    const row = columns.map((c) => String(c.values[i])).join('|');
    if (rowStrings.has(row)) {
      duplicateRows++;
    }
    rowStrings.add(row);
  }

  if (duplicateRows > 0) {
    issues.push(`Found ${duplicateRows} duplicate rows`);
  }

  // Score (0-100)
  let score = 100;
  score -= (1 - completeness) * 40;
  score -= Math.min(duplicateRows / Math.max(totalRows, 1), 0.5) * 30;
  score -= issues.length * 5;

  return {
    totalRows,
    totalColumns,
    completeness: round(completeness),
    duplicateRows,
    issues,
    score: Math.max(0, Math.round(score)),
  };
}

/**
 * Detect trends in time-series data
 */
export function detectTrend(values: number[]): {
  direction: 'up' | 'down' | 'flat';
  slope: number;
  confidence: number;
} {
  if (values.length < 3) {
    return { direction: 'flat', slope: 0, confidence: 0 };
  }

  // Simple linear regression
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) ** 2;
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;
  const direction = slope > 0.01 ? 'up' : slope < -0.01 ? 'down' : 'flat';

  // R-squared for confidence
  const predicted = values.map((_, i) => yMean + slope * (i - xMean));
  const ssRes = values.reduce((acc, v, i) => acc + (v - predicted[i]) ** 2, 0);
  const ssTot = values.reduce((acc, v) => acc + (v - yMean) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return {
    direction,
    slope: round(slope),
    confidence: round(Math.max(0, rSquared)),
  };
}

// Helpers
function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function round(n: number, decimals = 4): number {
  return Number(n.toFixed(decimals));
}
