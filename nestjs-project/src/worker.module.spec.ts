import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { WorkerModule } from './worker.module';
import { VIDEO_QUEUES } from './videos/videos.constants';

describe('WorkerModule', () => {
  it('should compile with the video queues and no HTTP layer', async () => {
    const module = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();

    const processing = module.get<Queue>(
      getQueueToken(VIDEO_QUEUES.PROCESSING),
    );

    expect(processing.name).toBe(VIDEO_QUEUES.PROCESSING);
    await module.close();
  }, 30000);
});
