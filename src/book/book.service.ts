import { Injectable, Logger } from '@nestjs/common'; 
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Book, BookDocument } from './book.schema';
import { CreateBookInput } from './dto/create-book.input';
import { UpdateBookInput } from './dto/update-book.input';
import { RedisService } from '../redis/redis.service';
import { KafkaService } from '../kafka/kafka.service';

@Injectable()
export class BookService {
// ประกาศ class BookService (บริการหลักที่จัดการ logic เกี่ยวกับ Book)

  private readonly logger = new Logger(BookService.name);
  // สร้าง logger instance ของ NestJS ไว้ใช้เขียน log โดยใช้ชื่อ 'BookService'

  constructor(
    @InjectModel(Book.name)
    // decorator บอก Nest ว่าจะ inject Mongoose Model ของ Book เข้ามา

    private bookModel: Model<BookDocument>,
    // ตัวแปรใน class ชื่อ bookModel คือ Mongoose Model ของ BookDocument

    private readonly redisService: RedisService,
    // inject RedisService เข้ามาเก็บไว้ในตัวแปร redisService (ใช้ cache)

    private readonly kafkaService: KafkaService,
    // inject KafkaService ไว้ใช้ส่ง event ไป Kafka

  ) {}

  // ---------- CREATE ----------
  async create(createBookInput: CreateBookInput) {
    // รับข้อมูลตาม CreateBookInput ของ dto

    this.logger.log('Creating book (MongoDB)…');
    const createdBook = new this.bookModel(createBookInput);
    // สร้าง instance ใหม่ของ bookModel จากข้อมูลที่ส่งเข้ามา

    const saved = await createdBook.save();
    // บันทึกลง MongoDB 

    this.logger.log('Clear books:all cache (Redis) after create');
    await this.redisService.del('books:all');
    // ลบ key 'books:all' ใน Redis เพื่อให้ list ทั้งหมดถูกดึงใหม่ในครั้งต่อไป

    this.logger.log(`Set cache book:${saved._id} (Redis)`);
    await this.redisService.set(`book:${saved._id}`, JSON.stringify(saved), 60);
    // เซ็ต cache ลง Redis โดยใช้ key book:<id> เก็บข้อมูลเป็น string และกำหนด TTL = 60 วินาที

    // ส่ง event ออก Kafka
    await this.kafkaService.emit('book.created', {
      // ใช้ kafkaService.emit ส่ง event ชื่อ 'book.created' ไปที่ Kafka
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
    // ลองดึงข้อมูลจาก Redis ตาม key ว่ามี cache อยู่ไหม

    if (cached) {
      // ถ้ามี cache อยู่

      this.logger.log('Get books from Redis cache (books:all)');
      // log ว่าดึงข้อมูลจาก Redis แทน MongoDB

      return JSON.parse(cached);
      // แปลง string ที่ cache ไว้กลับเป็น object/array แล้ว return ทันที
    }

    this.logger.log('Cache miss (books:all) → query MongoDB');
    // ถ้าไม่มี cache → log ว่า cache miss และจะไป query MongoDB

    const books = await this.bookModel.find().exec();
    // ใช้ Mongoose query ดึงหนังสือทั้งหมดจาก MongoDB

    this.logger.log('Set books:all to Redis cache');
    // log ว่าจะเซ็ต cache books:all

    await this.redisService.set(cacheKey, JSON.stringify(books), 60);
    // เซ็ต cache books:all เป็น string ของข้อมูลที่ดึงมา และกำหนด TTL 60 วินาที

    return books;
  }

  // ---------- FIND ONE ----------
  async findOne(id: string) {
    // method async รับ id เป็น string

    const cacheKey = `book:${id}`;
    // สร้าง key สำหรับ cache หนังสือเล่มนี้ เช่น book:123

    const cached = await this.redisService.get(cacheKey);
    // ลองดึง cache ตาม key จาก Redis

    if (cached) {
      // ถ้ามี cache

      this.logger.log(`Get book ${id} from Redis cache`);
      // log ว่าใช้ cache แทน MongoDB

      return JSON.parse(cached);
      // แปลง string ที่ cache ไว้เป็น object แล้ว return
    }

    this.logger.log(`Cache miss (book:${id}) → query MongoDB`);
    // ถ้าไม่มี cache → log ว่า cache miss และจะ query MongoDB

    const book = await this.bookModel.findById(id).exec();
    // ใช้ Mongoose ดึงหนังสือจาก MongoDB ตาม _id

    if (book) {
      // ถ้าหาเจอหนังสือ

      this.logger.log(`Set cache book:${id} to Redis`);
      // log ว่าจะเซ็ต cache สำหรับหนังสือเล่มนี้

      await this.redisService.set(cacheKey, JSON.stringify(book), 60);
      // เซ็ต cache book:<id> ใน Redis ให้มีอายุ 60 วินาที
    }

    return book;
    // return หนังสือ (หรือ null ถ้าไม่เจอ)

  }
  // ปิด method findOne

  // ---------- UPDATE ----------
  // ส่วนอัปเดตหนังสือ

  async update(id: string, updateBookInput: UpdateBookInput) {
    // method async รับ id ของหนังสือ และข้อมูลที่ใช้ update

    this.logger.log(`Update book ${id} in MongoDB`);
    // log ว่าจะอัปเดต book ใน MongoDB

    const updated = await this.bookModel.findByIdAndUpdate(
      id,
      updateBookInput,
      { new: true },
    );
    // ใช้ Mongoose อัปเดต document ตาม id ด้วยข้อมูล updateBookInput
    // { new: true } = ให้คืนค่าข้อมูลที่ถูกอัปเดตแล้ว (ไม่ใช่ค่าก่อนอัปเดต)

    this.logger.log(`Clear cache books:all & book:${id} in Redis`);
    // log ว่าจะลบ cache ของ list ทั้งหมด และ cache ของหนังสือเล่มนี้

    await this.redisService.del('books:all');
    // ลบ cache key 'books:all'

    await this.redisService.del(`book:${id}`);
    // ลบ cache key 'book:<id>'

    if (updated) {
      // ถ้าอัปเดตสำเร็จและมีข้อมูลกลับมา

      this.logger.log(`Set updated book:${id} to Redis`);
      // log ว่าจะเซ็ต cache ใหม่ของหนังสือเล่มนี้

      await this.redisService.set(`book:${id}`, JSON.stringify(updated), 60);
      // เซ็ต cache ของหนังสือเล่มที่ update แล้วให้ Redis
    }

    return updated;
    // คืนค่าหนังสือที่อัปเดตแล้ว (หรือ null ถ้าไม่เจอ/อัปเดตไม่ได้)

  }
  // ปิด method update

  // ---------- REMOVE ----------
  // ส่วนลบหนังสือ

  async remove(id: string) {
    // method async สำหรับลบหนังสือตาม id

    this.logger.log(`Remove book ${id} from MongoDB`);
    // log ว่าจะลบหนังสือจาก MongoDB

    const deleted = await this.bookModel.findByIdAndDelete(id).exec();
    // ใช้ Mongoose ลบ document ตาม id แล้วรอผลลัพธ์ (document ที่ถูกลบ)

    this.logger.log(`Clear cache books:all & book:${id} in Redis`);
    // log ว่าจะลบ cache ของรายการทั้งหมดและของหนังสือเล่มนี้

    await this.redisService.del('books:all');
    // ลบ cache key 'books:all'

    await this.redisService.del(`book:${id}`);
    // ลบ cache key 'book:<id>'

    return deleted;
    // return ข้อมูลหนังสือที่ถูกลบ (หรือ null ถ้าไม่เจอ)

  }
  // ปิด method remove
}
// ปิด class BookService
