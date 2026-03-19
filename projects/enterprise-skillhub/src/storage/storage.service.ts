import {
  Injectable,
  BadRequestException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import * as Minio from 'minio';
import * as path from 'path';

const MAX_UNCOMPRESSED_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_FILE_COUNT = 1000;
const ZIP_MAGIC_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04
const PRESIGNED_EXPIRY_SECONDS = 300; // 5 minutes

interface ZipEntry {
  entryName: string;
  header: { size: number };
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: Minio.Client;
  private bucket: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Minio.Client({
      endPoint: config.minioEndpoint,
      port: config.minioPort,
      useSSL: config.minioUseSsl,
      accessKey: config.minioAccessKey,
      secretKey: config.minioSecretKey,
    });
    this.bucket = config.minioBucket;
  }

  async onModuleInit() {
    await this.ensureBucket();
  }

  /**
   * Ensure the MinIO bucket exists
   */
  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Created bucket: ${this.bucket}`);
    }
  }

  /**
   * Upload a file buffer to MinIO
   */
  async uploadFile(
    storageKey: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<void> {
    const metaData: Record<string, string> = {};
    if (contentType) {
      metaData['Content-Type'] = contentType;
    }

    await this.client.putObject(
      this.bucket,
      storageKey,
      buffer,
      buffer.length,
      metaData,
    );
  }

  /**
   * Generate a pre-signed download URL (5 minutes)
   */
  async getPresignedUrl(storageKey: string): Promise<string> {
    return this.client.presignedGetObject(
      this.bucket,
      storageKey,
      PRESIGNED_EXPIRY_SECONDS,
    );
  }

  /**
   * Delete a file from MinIO
   */
  async deleteFile(storageKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, storageKey);
  }

  /**
   * Build a standard storage key: skills/{slug}/{version}/{path}
   */
  static buildStorageKey(
    slug: string,
    version: string,
    filePath: string,
  ): string {
    return `skills/${slug}/${version}/${filePath}`;
  }

  /**
   * Validate ZIP magic bytes (PK\x03\x04)
   */
  validateZipMagicBytes(buffer: Buffer): void {
    if (buffer.length < 4) {
      throw new BadRequestException('Invalid file: too small to be a ZIP');
    }
    const magic = buffer.subarray(0, 4);
    if (!magic.equals(ZIP_MAGIC_BYTES)) {
      throw new BadRequestException('Invalid file: not a ZIP archive');
    }
  }

  /**
   * Validate ZIP entries for:
   * - Total uncompressed size < 200MB (zip bomb protection)
   * - File count < 1000
   * - No path traversal (Zip Slip)
   */
  async validateZipEntries(entries: ZipEntry[]): Promise<void> {
    // Check file count
    if (entries.length > MAX_FILE_COUNT) {
      throw new BadRequestException(
        `ZIP file exceeds maximum of ${MAX_FILE_COUNT} files (found ${entries.length})`,
      );
    }

    let totalSize = 0;

    for (const entry of entries) {
      // Check path traversal (Zip Slip)
      const normalized = path.normalize(entry.entryName);
      if (
        normalized.startsWith('..') ||
        normalized.includes('/../') ||
        path.isAbsolute(normalized) ||
        entry.entryName.includes('../')
      ) {
        throw new BadRequestException(
          `ZIP path traversal detected: "${entry.entryName}"`,
        );
      }

      totalSize += entry.header.size;
    }

    // Check total uncompressed size
    if (totalSize > MAX_UNCOMPRESSED_SIZE) {
      throw new BadRequestException(
        `ZIP uncompressed size exceeds maximum of 200MB (found ${Math.round(totalSize / 1024 / 1024)}MB)`,
      );
    }
  }

  /**
   * Validate that SKILL.md exists in ZIP root
   */
  validateSkillMdPresence(entries: ZipEntry[]): void {
    const hasSkillMd = entries.some(
      (e) => e.entryName === 'SKILL.md' || e.entryName === './SKILL.md',
    );
    if (!hasSkillMd) {
      throw new BadRequestException(
        'SKILL.md is required in the root of the ZIP archive',
      );
    }
  }
}
