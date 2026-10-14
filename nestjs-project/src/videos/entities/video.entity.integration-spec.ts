import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import { User } from '../../users/entities/user.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { Video, VideoProcessingStatus, VideoStatus } from './video.entity';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('Video entity (integration)', () => {
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let channel: Channel;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    videoRepository = dataSource.getRepository(Video);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  let counter = 0;
  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const n = ++counter;
    const user = await dataSource.getRepository(User).save({
      email: `video_entity_${n}@example.com`,
      password: 'hashed',
    });
    channel = await dataSource.getRepository(Channel).save({
      name: `chan${n}`,
      nickname: `video_entity_${n}`,
      user_id: user.id,
    });
  });

  function buildVideo(overrides: Partial<Video> = {}): Video {
    return videoRepository.create({
      public_id: `pid${String(++counter).padStart(8, '0')}`,
      channel_id: channel.id,
      title: 'my-clip',
      original_filename: 'my-clip.mp4',
      mime_type: 'video/mp4',
      size_bytes: 1024,
      source_key: 'videos/x/source',
      ...overrides,
    });
  }

  it('should populate defaults for a minimal draft', async () => {
    const saved = await videoRepository.save(buildVideo());
    const found = await videoRepository.findOneByOrFail({ id: saved.id });

    expect(found.status).toBe(VideoStatus.DRAFT);
    expect(found.processing_status).toBe(VideoProcessingStatus.UPLOADING);
    expect(found.description).toBeNull();
    expect(found.processing_error).toBeNull();
    expect(found.created_at).toBeInstanceOf(Date);
    expect(found.updated_at).toBeInstanceOf(Date);
  });

  it('should reject two videos with the same public_id', async () => {
    await videoRepository.save(buildVideo({ public_id: 'dupDupDup01' }));

    await expect(
      videoRepository.save(buildVideo({ public_id: 'dupDupDup01' })),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('should round-trip size_bytes above 2^32 as a number', async () => {
    const tenGiB = 10 * 1024 ** 3;
    const saved = await videoRepository.save(
      buildVideo({ size_bytes: tenGiB }),
    );

    const found = await videoRepository.findOneByOrFail({ id: saved.id });
    expect(found.size_bytes).toBe(tenGiB);
  });

  it('should delete videos when their channel is deleted (ON DELETE CASCADE)', async () => {
    const saved = await videoRepository.save(buildVideo());

    await dataSource.query('DELETE FROM "channels" WHERE id = $1', [
      channel.id,
    ]);

    expect(await videoRepository.findOneBy({ id: saved.id })).toBeNull();
  });
});
