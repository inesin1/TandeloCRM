import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { Env } from '../../env.schema';
import { DATABASE_CONNECTION, Database, DatabaseExecutor } from '../database/database.module';
import { CopilotConfiguration, CopilotPublicSettings, copilotBaseUrlSchema, defaultCopilotBaseUrl } from './copilot-config.schema';
import { copilotSettings } from './copilot.entity';
import { UpdateCopilotSettingsDto } from './dto/update-copilot-settings.dto';

@Injectable()
export class CopilotSettingsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async getEffective(): Promise<CopilotConfiguration> {
    const row = await this.findSaved();
    if (!row) return this.environment();
    return {
      enabled: row.enabled, apiFormat: row.apiFormat, baseUrl: row.baseUrl, model: row.model,
      apiKey: row.apiKeyEncrypted ? this.decrypt(row.apiKeyEncrypted) : undefined,
    };
  }

  async getPublic(): Promise<CopilotPublicSettings> {
    const row = await this.findSaved();
    if (row) return { enabled: row.enabled, apiFormat: row.apiFormat, baseUrl: row.baseUrl, model: row.model, apiKeySet: !!row.apiKeyEncrypted, source: 'database' };
    const { apiKey, ...settings } = this.environment();
    return { ...settings, apiKeySet: !!apiKey, source: 'environment' };
  }

  async save(dto: UpdateCopilotSettingsDto): Promise<CopilotPublicSettings> {
    const parsedUrl = copilotBaseUrlSchema.safeParse(dto.baseUrl);
    if (!parsedUrl.success) throw new BadRequestException('Invalid provider base URL');
    const baseUrl = parsedUrl.data;
    const model = dto.model.trim();
    if (dto.enabled && !model) throw new BadRequestException('A model is required to enable Copilot');
    if (typeof dto.apiKey === 'string' && (!dto.apiKey.trim() || /[\r\n]/.test(dto.apiKey))) {
      throw new BadRequestException('API key must be non-empty and contain no line breaks');
    }
    return this.db.transaction(async (tx) => {
      // Serialize the first insert too, so preserving a key cannot race with a provider change.
      await tx.execute(sql`select pg_advisory_xact_lock(81724901)`);
      const saved = await this.findSaved(tx);
      const fallback = this.environment();
      const previousBaseUrl = saved?.baseUrl ?? fallback.baseUrl;
      let encrypted = saved?.apiKeyEncrypted ?? (saved ? null : fallback.apiKey ? this.encrypt(fallback.apiKey) : null);
      if (dto.apiKey === null || previousBaseUrl !== baseUrl) encrypted = null;
      if (typeof dto.apiKey === 'string') encrypted = this.encrypt(dto.apiKey.trim());
      if (dto.enabled && new URL(baseUrl).hostname === 'api.openai.com' && !encrypted) {
        throw new BadRequestException('An API key is required for OpenAI');
      }
      const values = { enabled: dto.enabled, apiFormat: dto.apiFormat, baseUrl, model, apiKeyEncrypted: encrypted, updatedAt: new Date() };
      await tx.insert(copilotSettings).values({ id: 1, ...values }).onConflictDoUpdate({ target: copilotSettings.id, set: values });
      return { enabled: dto.enabled, apiFormat: dto.apiFormat, baseUrl, model, apiKeySet: !!encrypted, source: 'database' as const };
    });
  }

  private async findSaved(executor: DatabaseExecutor = this.db) {
    const [row] = await executor.select().from(copilotSettings).where(eq(copilotSettings.id, 1)).limit(1);
    return row;
  }

  private environment(): CopilotConfiguration {
    const baseUrl = this.config.get('COPILOT_BASE_URL', { infer: true });
    return {
      enabled: this.config.get('COPILOT_ENABLED', { infer: true }),
      apiFormat: this.config.get('COPILOT_API_FORMAT', { infer: true }),
      baseUrl,
      model: this.config.get('COPILOT_MODEL', { infer: true }) ?? '',
      apiKey: this.config.get('COPILOT_API_KEY', { infer: true }) ?? (baseUrl === defaultCopilotBaseUrl ? this.config.get('OPENAI_API_KEY', { infer: true }) : undefined),
    };
  }

  private encryptionKey() {
    return Buffer.from(hkdfSync('sha256', this.config.get('JWT_SECRET', { infer: true }), 'tandelo', 'copilot-provider-key-v1', 32));
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
  }

  private decrypt(value: string) {
    try {
      const parts = value.split('.');
      if (parts.length !== 3) throw new Error();
      const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64url'));
      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException('Provider key cannot be decrypted. Re-enter it in Copilot settings.');
    }
  }
}
