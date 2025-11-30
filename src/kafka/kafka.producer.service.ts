import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Producer, Admin } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;
  private admin: Admin;
  private isConnected = false;

  async onModuleInit() {
    const broker = process.env.KAFKA_BROKER || 'localhost:9092';

    this.kafka = new Kafka({
      clientId: 'nest-app',
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

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });

    this.admin = this.kafka.admin();

    this.logger.log(`Connecting Kafka producer to ${broker}...`);

    try {
      await this.producer.connect();
      await this.admin.connect();
      this.isConnected = true;
      this.logger.log('Kafka producer connected');
    } catch (err) {
      this.isConnected = false;
      this.logger.error('Kafka connection failed, continue without Kafka');
      this.logger.error(err.message);
    }
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      this.logger.log('Disconnecting Kafka producer...');
      await this.producer.disconnect();
      await this.admin.disconnect();
    }
  }

  async emit(topic: string, message: any) {
    if (!this.isConnected) {
      this.logger.warn(`Kafka not connected, skip emit → topic=${topic}`);
      return;
    }

    try {
      await this.ensureTopicExists(topic);

      const messageString = JSON.stringify(message);

      await this.producer.send({
        topic,
        messages: [{ value: messageString }],
      });

      // แสดงข้อมูลเป็น JSON
      this.logger.log(`Sent to topic [${topic}]:`);
      this.logger.log(JSON.stringify(message, null, 2)); 
      
    } catch (err) {
      this.logger.error(`Failed to emit to ${topic}:`, err.message);
      
      if (err.message.includes('topic-partition') || err.message.includes('UNKNOWN_TOPIC_OR_PARTITION')) {
        this.logger.warn(`Topic ${topic} not found, creating and retrying...`);
        try {
          await this.createTopic(topic);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const messageString = JSON.stringify(message);
          await this.producer.send({
            topic,
            messages: [{ value: messageString }],
          });
          
          this.logger.log(`Sent to topic [${topic}] (retry):`);
          this.logger.log(JSON.stringify(message, null, 2));
          
        } catch (retryErr) {
          this.logger.error(`Retry failed for topic ${topic}:`, retryErr.message);
        }
      }
    }
  }

  private async ensureTopicExists(topic: string) {
    try {
      const topics = await this.admin.listTopics();
      if (!topics.includes(topic)) {
        await this.createTopic(topic);
      }
    } catch (err) {
      this.logger.warn(`Could not check topic existence: ${err.message}`);
    }
  }

  private async createTopic(topic: string) {
    try {
      await this.admin.createTopics({
        topics: [
          {
            topic,
            numPartitions: 1,
            replicationFactor: 1,
          },
        ],
      });
      this.logger.log(`Topic created: ${topic}`);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        this.logger.error(`Failed to create topic ${topic}:`, err.message);
      }
    }
  }
}