import { CsvExportService } from './csv-export.service';

describe('CsvExportService', () => {
  let service: CsvExportService;

  beforeEach(() => {
    service = new CsvExportService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateCsv', () => {
    const columns = [
      { header: 'Name', key: 'name' },
      { header: 'Age', key: 'age' },
      { header: 'Email', key: 'email' },
    ];

    it('should generate CSV with headers and data', () => {
      const data = [
        { name: 'Alice', age: 30, email: 'alice@test.com' },
        { name: 'Bob', age: 25, email: 'bob@test.com' },
      ];

      const result = service.generateCsv(data, columns);

      expect(result).toBe(
        'Name,Age,Email\nAlice,30,alice@test.com\nBob,25,bob@test.com\n',
      );
    });

    it('should return only headers when data is empty', () => {
      const result = service.generateCsv([], columns);

      expect(result).toBe('Name,Age,Email\n');
    });

    it('should handle null and undefined values', () => {
      const data = [
        { name: 'Alice', age: null, email: undefined },
      ];

      const result = service.generateCsv(data, columns);

      expect(result).toBe('Name,Age,Email\nAlice,,\n');
    });

    it('should escape fields containing commas', () => {
      const data = [
        { name: 'Last, First', age: 30, email: 'test@test.com' },
      ];

      const result = service.generateCsv(data, columns);

      expect(result).toContain('"Last, First"');
    });

    it('should escape fields containing quotes', () => {
      const data = [
        { name: 'She said "hello"', age: 30, email: 'test@test.com' },
      ];

      const result = service.generateCsv(data, columns);

      expect(result).toContain('"She said ""hello"""');
    });

    it('should escape fields containing newlines', () => {
      const data = [
        { name: 'Line1\nLine2', age: 30, email: 'test@test.com' },
      ];

      const result = service.generateCsv(data, columns);

      expect(result).toContain('"Line1\nLine2"');
    });

    it('should format Date objects as ISO strings', () => {
      const date = new Date('2026-03-15T10:00:00.000Z');
      const data = [
        { name: 'Alice', age: date, email: 'test@test.com' },
      ];

      const result = service.generateCsv(data, columns);

      expect(result).toContain('2026-03-15T10:00:00.000Z');
    });

    it('should JSON-stringify object values', () => {
      const data = [
        { name: 'Alice', age: { nested: true }, email: 'test@test.com' },
      ];

      const result = service.generateCsv(data, columns);

      // Object values get JSON-stringified, which contains quotes → CSV-escaped
      // JSON: {"nested":true} → CSV escaping wraps in quotes and doubles inner quotes
      expect(result).toContain('"{""nested"":true}"');
    });

    it('should handle headers containing special characters', () => {
      const specialColumns = [
        { header: 'Name, First', key: 'name' },
      ];
      const data = [{ name: 'Alice' }];

      const result = service.generateCsv(data, specialColumns);

      expect(result).toContain('"Name, First"');
    });
  });
});
