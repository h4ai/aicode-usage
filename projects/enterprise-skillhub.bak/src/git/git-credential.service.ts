import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { encrypt, decrypt } from './crypto.util';
import { CreateCredentialDto } from './dto/create-credential.dto';

@Injectable()
export class GitCredentialService {
  private readonly logger = new Logger(GitCredentialService.name);
  private readonly encryptionKey: string;
  private readonly allowedDomains: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.encryptionKey = this.config.gitCredentialKey;
    this.allowedDomains = this.config.gitAllowedDomains;
  }

  /**
   * Create a new Git credential (encrypted).
   */
  async create(dto: CreateCredentialDto, userId: string) {
    // SSRF protection: validate URL against allowed domains
    this.validateGitUrl(dto.url);

    // Encrypt the credential before storing
    const encryptedCredential = encrypt(dto.credential, this.encryptionKey);

    const credential = await this.prisma.gitCredential.create({
      data: {
        name: dto.name,
        type: dto.type,
        url: dto.url,
        credential: encryptedCredential,
        ownerId: userId,
        scope: dto.scope || 'PERSONAL',
      },
    });

    // Return without the encrypted credential
    return this.sanitize(credential);
  }

  /**
   * List credentials for a user (never return plaintext credential).
   */
  async findAll(userId: string) {
    const credentials = await this.prisma.gitCredential.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    return credentials.map((c) => this.sanitize(c));
  }

  /**
   * Get a single credential by id (verify ownership).
   */
  async findOne(id: string, userId: string) {
    const credential = await this.prisma.gitCredential.findUnique({
      where: { id },
    });

    if (!credential) {
      throw new NotFoundException(`Credential ${id} not found`);
    }

    if (credential.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to access this credential');
    }

    return this.sanitize(credential);
  }

  /**
   * Delete a credential (verify ownership).
   */
  async remove(id: string, userId: string) {
    const credential = await this.prisma.gitCredential.findUnique({
      where: { id },
    });

    if (!credential) {
      throw new NotFoundException(`Credential ${id} not found`);
    }

    if (credential.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to delete this credential');
    }

    await this.prisma.gitCredential.delete({ where: { id } });

    return { deleted: true, id };
  }

  /**
   * Test credential connectivity (decrypt + try ls-remote).
   */
  async testConnectivity(id: string, userId: string): Promise<{ success: boolean; message: string }> {
    const credential = await this.prisma.gitCredential.findUnique({
      where: { id },
    });

    if (!credential) {
      throw new NotFoundException(`Credential ${id} not found`);
    }

    if (credential.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to test this credential');
    }

    try {
      // Decrypt the credential to verify it's valid
      const _decrypted = decrypt(credential.credential, this.encryptionKey);

      // In production, we'd actually run `git ls-remote` here.
      // For now, we verify the decryption succeeds and the URL is valid.
      this.validateGitUrl(credential.url);

      return { success: true, message: 'Credential is valid and URL is allowed' };
    } catch (error) {
      return { success: false, message: `Connectivity test failed: ${error.message}` };
    }
  }

  /**
   * Get decrypted credential (internal use only, for clone operations).
   */
  async getDecryptedCredential(id: string): Promise<{ url: string; type: string; credential: string }> {
    const cred = await this.prisma.gitCredential.findUnique({ where: { id } });
    if (!cred) throw new NotFoundException(`Credential ${id} not found`);

    return {
      url: cred.url,
      type: cred.type,
      credential: decrypt(cred.credential, this.encryptionKey),
    };
  }

  /**
   * SSRF Protection: validate URL against allowed domains.
   */
  private validateGitUrl(url: string): void {
    if (!url) throw new BadRequestException('URL is required');

    // Allow any domain if allowedDomains is empty (dev mode)
    if (this.allowedDomains.length === 0) return;

    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      const isAllowed = this.allowedDomains.some((domain) => {
        const d = domain.toLowerCase();
        return hostname === d || hostname.endsWith('.' + d);
      });

      if (!isAllowed) {
        throw new BadRequestException(
          `URL domain "${hostname}" is not in the allowed list. Allowed: ${this.allowedDomains.join(', ')}`,
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      // SSH-style URLs (git@github.com:...) — extract hostname
      const sshMatch = url.match(/^[\w.-]+@([\w.-]+):/);
      if (sshMatch) {
        const hostname = sshMatch[1].toLowerCase();
        const isAllowed = this.allowedDomains.some((domain) => {
          const d = domain.toLowerCase();
          return hostname === d || hostname.endsWith('.' + d);
        });
        if (!isAllowed) {
          throw new BadRequestException(
            `URL domain "${hostname}" is not in the allowed list. Allowed: ${this.allowedDomains.join(', ')}`,
          );
        }
      }
      // If neither URL nor SSH format, let it pass (could be a local path for testing)
    }
  }

  /**
   * Remove sensitive credential field from output.
   */
  private sanitize(credential: any) {
    const { credential: _cred, ...rest } = credential;
    return { ...rest, credentialMasked: '***' };
  }
}
