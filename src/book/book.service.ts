import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Book, BookDocument } from './book.schema';
import { CreateBookInput } from './dto/create-book.input';
import { UpdateBookInput } from './dto/update-book.input';
import { RedisService } from '../redis/redis.service';
import { KafkaProducerService } from '../kafka/kafka.producer.service';
import { KafkaConsumerService } from '../kafka/kafka.consumer.service';

@Injectable()
export class BookService {
  private readonly logger = new Logger(BookService.name);
  // สร้าง logger instance ใช้เขียน log

  constructor(
    @InjectModel(Book.name)
    private bookModel: Model<BookDocument>,
    private readonly redisService: RedisService,
    private readonly kafkaService: KafkaProducerService,
    private readonly kafkaConsumerService: KafkaConsumerService,
  ) {}

  // ---------- KAFKA CONSUMER SETUP ----------
  async onModuleInit() {
    await this.kafkaConsumerService.subscribe(
      'createdbook',
      async (payload) => {
        this.logger.log(
          `Received createdbook from Kafka in BookService: ${JSON.stringify(
            payload,
          )}`,
        );

        const id = payload._id;
        if (!id) {
          this.logger.warn(
            'Kafka createdbook payload has no _id, skip cache refresh',
          );
          return;
        }

        const book = await this.bookModel.findById(id);
        if (!book) {
          this.logger.warn(
            `Book with id ${id} not found in MongoDB while handling Kafka event`,
          );
          return;
        }

        this.logger.log(`Update Redis cache for book:${id} from Kafka event`);
        await this.redisService.set(
          `book:${id}`,
          JSON.stringify(book),
          60, 
        );
      },
    );
  }

  // ---------- CREATE ----------
  // ***
  /***
   * สร้างหนังสือใหม่
   * - บันทึกลง MongoDB
   * - ลบ cache รายการหนังสือทั้งหมดใน Redis
   */
  async create(createBookInput: CreateBookInput) {
    // รับข้อมูลตาม CreateBookInput ของ dto

    this.logger.log('Creating book (MongoDB)…');
    const createdBook = new this.bookModel(createBookInput);
    // สร้าง instance ใหม่ของ bookModel จากข้อมูลที่ส่งเข้ามา

    const saved = await createdBook.save();
    this.logger.log('Clear books:all cache (Redis) after create');
    await this.redisService.del('books:all');
    // ลบ key 'books:all' ใน Redis เพื่อให้ list ทั้งหมดถูกดึงใหม่ในครั้งต่อไป

    this.logger.log(`Set cache book:${saved._id} (Redis)`);
    await this.redisService.set(`book:${saved._id}`, JSON.stringify(saved), 60);
    // เซ็ต cache ลง Redis โดยใช้ key book:<id> เก็บข้อมูลเป็น string และกำหนด TTL = 60 วินาที

    // ส่ง event ออก Kafka
    await this.kafkaService.emit('createdbook', {
      // ใช้ kafkaService.emit ส่ง event ชื่อ 'createdbook' ไปที่ Kafka
      _id: saved._id,
      title: saved.title,
      author: saved.author,
      publishedYear: saved.publishedYear,
    });
    return saved;
  }

  // ---------- FIND ALL ----------
  async findAll() {
    const cacheKey = 'books:all';
    // กำหนดชื่อ key ของ cache สำหรับรายการหนังสือทั้งหมด

    const cached = await this.redisService.get(cacheKey);
    // ดึงข้อมูลจาก Redis ตาม key

    if (cached) {
      this.logger.log('Get books from Redis cache (books:all)');
      return JSON.parse(cached);
      // แปลง string ที่ cache ไว้กลับเป็น object
    }

    this.logger.log('Cache miss (books:all) → query MongoDB');

    const books = await this.bookModel.find();
    // ดึงหนังสือทั้งหมด

    this.logger.log('Set books:all to Redis cache');

    await this.redisService.set(cacheKey, JSON.stringify(books), 60);
    // เซ็ต cache books:all เป็น string ของข้อมูลที่ดึงมา และเวลาหมดอายุ 60 วินาที

    return books;
  }

  // ---------- FIND ONE ----------
  async findOne(id: string) {
    const cacheKey = `book:${id}`;
    // สร้าง key สำหรับ cache หนังสือเล่มนี้

    const cached = await this.redisService.get(cacheKey);
    // ลองดึง cache ตาม key จาก Redis

    if (cached) {
      this.logger.log(`Get book ${id} from Redis cache`);
      return JSON.parse(cached);
      // แปลง string ที่ cache ไว้เป็น object แล้ว return
    }

    this.logger.log(`Cache miss (book:${id}) → query MongoDB`);

    const book = await this.bookModel.findById(id);
    // ดึงหนังสือตาม _id

    if (book) {
      this.logger.log(`Set cache book:${id} to Redis`);
      await this.redisService.set(cacheKey, JSON.stringify(book), 60);
      // เซ็ต cache book:<id> ใน Redis ให้มีอายุ 60 วินาที
    }

    return book;
  }

  // ---------- UPDATE ----------
  async update(id: string, updateBookInput: UpdateBookInput) {
    this.logger.log(`Update book ${id} in MongoDB`);

    // อัปเดต document ตาม id ด้วยข้อมูล updateBookInput
    const updated = await this.bookModel.findByIdAndUpdate(
      id,
      updateBookInput,
      { new: true },
    );

    this.logger.log(`Clear cache books:all & book:${id} in Redis`);

    await this.redisService.del('books:all');
    // ลบ cache key 'books:all'

    await this.redisService.del(`book:${id}`);
    // ลบ cache key 'book:<id>'

    if (updated) {
      this.logger.log(`Set updated book:${id} to Redis`);
      await this.redisService.set(`book:${id}`, JSON.stringify(updated), 60);
      // เซ็ต cache หนังสือที่ update ให้ Redis
    }

    return updated;
  }

  // ---------- REMOVE ----------
  async remove(id: string) {
    this.logger.log(`Remove book ${id} from MongoDB`);

    const deleted = await this.bookModel.findByIdAndDelete(id);
    // ลบ document ตาม id

    this.logger.log(`Clear cache books:all & book:${id} in Redis`);

    await this.redisService.del('books:all');
    // ลบ cache key 'books:all'

    await this.redisService.del(`book:${id}`);
    // ลบ cache key 'book:<id>'

    return deleted;
  }
}
