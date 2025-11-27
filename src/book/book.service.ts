import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Book, BookDocument } from './book.schema';
import { CreateBookInput } from './dto/create-book.input';
import { UpdateBookInput } from './dto/update-book.input';

@Injectable()
export class BookService {
  constructor(
    @InjectModel(Book.name)
    private bookModel: Model<BookDocument>,
  ) {}

  create(createBookInput: CreateBookInput) {
    const createdBook = new this.bookModel(createBookInput);
    return createdBook.save();
  }

  findAll() {
    return this.bookModel.find().exec();
  }

  findOne(id: string) {
    return this.bookModel.findById(id).exec();
  }

  update(id: string, updateBookInput: UpdateBookInput) {
    return this.bookModel.findByIdAndUpdate(id, updateBookInput, { new: true });
  }

  remove(id: string) {
    return this.bookModel.findByIdAndDelete(id).exec();
  }
}
