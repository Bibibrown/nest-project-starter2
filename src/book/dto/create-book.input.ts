import { InputType, Field, Int } from '@nestjs/graphql';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

@InputType()
export class CreateBookInput {
  @Field()
  @IsString()
  @IsNotEmpty({ message: 'title ห้ามว่าง' })
  title: string;

  @Field()
  @IsString()
  @IsNotEmpty({ message: 'author ห้ามว่าง' })
  author: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt({ message: 'publishedYear ต้องเป็นจำนวนเต็ม (Int)' })
  @Min(0, { message: 'publishedYear ต้องมากกว่าหรือเท่ากับ 0' })
  publishedYear?: number;
}
