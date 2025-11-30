import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Consumer } from 'kafkajs';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private isConnected = false;

  // kafka.consumer.service.ts
  async onModuleInit() {
    const broker = process.env.KAFKA_BROKER || 'localhost:9092';

    this.kafka = new Kafka({
      clientId: 'nest-app-consumer',
      brokers: [broker],
      // ... retry, timeout ตามเดิม
    });

    this.consumer = this.kafka.consumer({
      groupId: process.env.KAFKA_CONSUMER_GROUP || 'nest-app-group',
    });

    this.logger.log(`Connecting Kafka consumer to ${broker}...`);

    try {
      await this.consumer.connect();
      this.isConnected = true;
      this.logger.log('Kafka consumer connected ✅');

      // ❌ อย่ามี subscribe ตรงนี้แล้ว
      // ให้ service อื่น (เช่น BookService) มาเรียก subscribe เองภายหลัง
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
   * สมัครใจเป็น consumer ของ topic นั้น ๆ พร้อม handler
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

          // สมมติส่งเป็น JSON ก็ลอง parse
          try {
            payload = JSON.parse(valueString);
          } catch {
            // ถ้า parse ไม่ได้ก็ใช้ string ตรง ๆ ไป
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
