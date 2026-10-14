import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AppModule } from './app.module';
import { VIDEO_QUEUES } from './videos/videos.constants';

describe('AppModule', () => {
  it('should compile and register the video-processing and video-maintenance queues', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const processing = module.get<Queue>(
      getQueueToken(VIDEO_QUEUES.PROCESSING),
    );
    const maintenance = module.get<Queue>(
      getQueueToken(VIDEO_QUEUES.MAINTENANCE),
    );

    expect(processing.name).toBe(VIDEO_QUEUES.PROCESSING);
    expect(maintenance.name).toBe(VIDEO_QUEUES.MAINTENANCE);
    await module.close();
  }, 30000);
});
