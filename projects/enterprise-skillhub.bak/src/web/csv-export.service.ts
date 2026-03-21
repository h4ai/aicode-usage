import { Injectable } from '@nestjs/common';

export interface CsvColumn {
  header: string;
  key: string;
}

@Injectable()
export class CsvExportService {
  /**
   * Convert an array of objects to CSV string.
   */
  generateCsv(data: Record<string, any>[], columns: CsvColumn[]): string {
    if (data.length === 0) {
      return columns.map((c) => this.escapeCsvField(c.header)).join(',') + '\n';
    }

    // Header row
    const header = columns.map((c) => this.escapeCsvField(c.header)).join(',');

    // Data rows
    const rows = data.map((row) =>
      columns
        .map((col) => {
          const value = row[col.key];
          return this.escapeCsvField(this.formatValue(value));
        })
        .join(','),
    );

    return [header, ...rows].join('\n') + '\n';
  }

  private formatValue(value: any): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private escapeCsvField(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }
}
