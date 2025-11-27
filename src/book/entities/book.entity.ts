import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

@ObjectType()
export class BookEntity {
  @Field(() => ID)
  _id: string;

  @Field()
  title: string;

  @Field()
  author: string;

  @Field(() => Int)
  publishedYear: number;
}
