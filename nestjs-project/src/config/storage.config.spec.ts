import { ConfigModule, type ConfigType } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import storageConfig from './storage.config';

const loadConfig = async (
  env: Record<string, string>,
): Promise<ConfigType<typeof storageConfig>> => {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k];
    process.env[k] = env[k];
  }
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ ignoreEnvFile: true, load: [storageConfig] }),
    ],
  }).compile();
  const config = module.get<ConfigType<typeof storageConfig>>(
    storageConfig.KEY,
  );
  await module.close();
  for (const k of Object.keys(env)) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
  return config;
};

describe('storageConfig', () => {
  it('defaults forcePathStyle to true for SeaweedFS', async () => {
    const config = await loadConfig({
      STORAGE_ACCESS_KEY: 'ak',
      STORAGE_SECRET_KEY: 'sk',
    });
    expect(config.forcePathStyle).toBe(true);
    expect(config.bucket).toBe('streamtube');
  });

  it('parses presignTtlSeconds', async () => {
    const config = await loadConfig({
      STORAGE_ACCESS_KEY: 'ak',
      STORAGE_SECRET_KEY: 'sk',
      STORAGE_PRESIGN_TTL_SECONDS: '120',
    });
    expect(config.presignTtlSeconds).toBe(120);
  });
});
