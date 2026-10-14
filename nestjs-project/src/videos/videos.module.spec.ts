import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import type { Repository } from 'typeorm';
import { InfrastructureModule } from '../infrastructure.module';
import { UsersModule } from '../users/users.module';
import { Video } from './entities/video.entity';
import { VIDEO_QUEUES } from './videos.constants';
import { VideosModule } from './videos.module';

describe('VideosModule', () => {
  it('should compile and expose the Video repository and processing queue', async () => {
    const module = await Test.createTestingModule({
      imports: [InfrastructureModule, UsersModule, VideosModule],
    }).compile();

    const repository = module.get<Repository<Video>>(getRepositoryToken(Video));

    expect(repository.metadata.tableName).toBe('videos');
    expect(module.get(getQueueToken(VIDEO_QUEUES.PROCESSING))).toBeDefined();
    await module.close();
  }, 30000);
});
