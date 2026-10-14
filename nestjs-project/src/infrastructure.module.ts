import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import mailConfig from './config/mail.config';
import redisConfig from './config/redis.config';
import storageConfig from './config/storage.config';
import swaggerConfig from './config/swagger.config';
import videosConfig from './config/videos.config';
import { envValidationSchema } from './config/env.validation';

/**
 * Global infrastructure shared by both processes (API and video worker):
 * validated config, the TypeORM connection and the BullMQ connection.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        authConfig,
        databaseConfig,
        mailConfig,
        redisConfig,
        storageConfig,
        swaggerConfig,
        videosConfig,
      ],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [databaseConfig.KEY],
      useFactory: (dbConfig: ConfigType<typeof databaseConfig>) => ({
        type: 'postgres',
        host: dbConfig.host,
        port: dbConfig.port,
        username: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.name,
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [redisConfig.KEY],
      useFactory: (cfg: ConfigType<typeof redisConfig>) => ({
        prefix: cfg.queuePrefix,
        connection: {
          host: cfg.host,
          port: cfg.port,
          password: cfg.password,
        },
      }),
    }),
  ],
})
export class InfrastructureModule {}
