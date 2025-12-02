import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Kafka, Consumer } from 'kafkajs';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private isConnected = false;

  async onModuleInit() {
    const broker = process.env.KAFKA_BROKER || 'localhost:9092';
    const CONSUMER_CLIENT_ID = `nest-app-consumer-${randomUUID()}`;

    this.kafka = new Kafka({
      clientId: CONSUMER_CLIENT_ID,
      brokers: [broker],
      retry: {
        initialRetryTime: 300,
        retries: 8,
        maxRetryTime: 30000,
        multiplier: 2,
      },
      connectionTimeout: 10000,
      requestTimeout: 30000,
    });

    this.consumer = this.kafka.consumer({
      groupId: process.env.KAFKA_CONSUMER_GROUP || 'nest-app-group',
    });

    this.logger.log(`Connecting Kafka consumer to ${broker}...`);

    try {
      await this.consumer.connect();
      this.isConnected = true;
      this.logger.log('Kafka consumer connected ✅');

    } catch (error) {
      this.logger.error('Failed to connect Kafka consumer', error.stack);
    }
  }

  async onModuleDestroy() {
    if (this.isConnected && this.consumer) {
      this.logger.log('Disconnecting Kafka consumer...');
      await this.consumer.disconnect();
      this.logger.log('Kafka consumer disconnected ✅');
    }
  }

  /**
   * เป็น consumer ของ topic นั้น ๆ พร้อม handler
   */
  async subscribe(
    topic: string,
    handler: (data: any) => Promise<void> | void,
    fromBeginning = false,
  ) {
    if (!this.isConnected) {
      this.logger.error('Kafka consumer is not connected yet');
      return;
    }

    this.logger.log(`Subscribing to topic "${topic}"...`);

    await this.consumer.subscribe({ topic, fromBeginning });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const valueString = message.value?.toString() || '';
          let payload: any = valueString;

          try {
            payload = JSON.parse(valueString);
          } catch {

          }

          this.logger.log(
            `Received message from ${topic}[${partition}] offset=${message.offset}: ${valueString}`,
          );

          await handler(payload);
        } catch (err) {
          this.logger.error(
            `Error handling message from topic "${topic}": ${err.message}`,
            err.stack,
          );
        }
      },
    });

    this.logger.log(`Consumer is now listening on topic "${topic}"`);
  }
}
