import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BookDocument = Book & Document;

@Schema()
export class Book {
  _id: string;
  
  @Prop()
  title: string;

  @Prop()
  author: string;

  @Prop()
  publishedYear: number;
}

export const BookSchema = SchemaFactory.createForClass(Book);
