import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileFilter } from './file-filter';

describe('FileFilter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filefilter-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should remove files for disabled features', async () => {
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:18');
    fs.mkdirSync(path.join(tmpDir, 'docker'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'docker', 'compose.yml'), 'version: "3"');

    const features = { docker: false };
    const featureMap = { docker: ['Dockerfile', 'docker'] };

    const removed = await FileFilter.filter(tmpDir, features, featureMap);

    expect(removed).toHaveLength(2);
    expect(fs.existsSync(path.join(tmpDir, 'Dockerfile'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'docker'))).toBe(false);
  });

  it('should keep files for enabled features', async () => {
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:18');

    const features = { docker: true };
    const featureMap = { docker: ['Dockerfile'] };

    const removed = await FileFilter.filter(tmpDir, features, featureMap);

    expect(removed).toHaveLength(0);
    expect(fs.existsSync(path.join(tmpDir, 'Dockerfile'))).toBe(true);
  });

  it('should handle non-existent files gracefully', async () => {
    const features = { ci: false };
    const featureMap = { ci: ['.github'] };

    const removed = await FileFilter.filter(tmpDir, features, featureMap);
    expect(removed).toHaveLength(0);
  });

  it('should handle multiple features', async () => {
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node');
    fs.writeFileSync(path.join(tmpDir, '.eslintrc'), '{}');

    const features = { docker: false, linting: true };
    const featureMap = {
      docker: ['Dockerfile'],
      linting: ['.eslintrc'],
    };

    const removed = await FileFilter.filter(tmpDir, features, featureMap);

    expect(removed).toHaveLength(1);
    expect(fs.existsSync(path.join(tmpDir, 'Dockerfile'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.eslintrc'))).toBe(true);
  });
});
