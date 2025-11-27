import { Module } from '@nestjs/common';
import { AppResolver } from './app.resolver';
import { AppService } from './app.service';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { ConfigService } from '@nestjs/config/dist/config.service';
import { BookModule } from './book/book.module';
import { CacheModule } from '@nestjs/cache-manager';
import { KafkaModule } from './kafka/kafka.module';
import { RedisModule } from './redis/redis.module';
import * as redisStore from 'cache-manager-ioredis';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      playground: false,
      plugins: [ApolloServerPluginLandingPageLocalDefault()],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('DATABASE_URL'),
      }),
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        store: redisStore as any,
        host: config.get('REDIS_HOST'),
        port: config.get('REDIS_PORT'),
        ttl: config.get('REDIS_TTL'),
      }),
    }),
    ConfigModule.forRoot({
      cache: true,
    }),
    BookModule,
    KafkaModule,
    RedisModule,
  ],
  providers: [AppService, AppResolver],
})
export class AppModule {}
