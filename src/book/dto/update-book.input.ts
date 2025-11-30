import { InputType, Field, ID, PartialType } from '@nestjs/graphql';
import { IsMongoId, IsNotEmpty } from 'class-validator';

import { CreateBookInput } from './create-book.input';

@InputType()
export class UpdateBookInput extends PartialType(CreateBookInput) {
  @Field(() => ID)
  @IsMongoId({ message: '_id ต้องเป็น Mongo ObjectId ที่ถูกต้อง' })
  @IsNotEmpty({ message: '_id ห้ามว่าง' })
  _id: string;
}
