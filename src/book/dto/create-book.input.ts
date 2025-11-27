import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class CreateBookInput {
  @Field()
  title: string;

  @Field()
  author: string;

  @Field(() => Int)
  publishedYear: number;
}
