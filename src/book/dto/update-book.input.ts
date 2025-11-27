import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class UpdateBookInput {
  @Field()
  _id: string;
}
