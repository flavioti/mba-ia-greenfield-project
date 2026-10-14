import { Module } from '@nestjs/common';
import { InfrastructureModule } from './infrastructure.module';
import { UsersModule } from './users/users.module';
import { VideosWorkerModule } from './videos/videos-worker.module';

/**
 * Root module of the video worker process (`src/worker.ts`). Shares the
 * infrastructure (config, TypeORM, BullMQ) with the API but registers only
 * queue consumers — no HTTP controllers. `UsersModule` (which brings
 * `ChannelsModule`) completes the Video → Channel → User entity graph that
 * `autoLoadEntities` needs to build metadata.
 */
@Module({
  imports: [InfrastructureModule, UsersModule, VideosWorkerModule],
})
export class WorkerModule {}
