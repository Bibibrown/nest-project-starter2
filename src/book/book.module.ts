import { Module } from '@nestjs/common';
import { BookService } from './book.service';
import { BookResolver } from './book.resolver';
import { MongooseModule } from '@nestjs/mongoose';
import { Book, BookSchema } from './book.schema';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Book.name, schema: BookSchema },
    ]),
  ],
  providers: [BookResolver, BookService],
})
export class BookModule {}
