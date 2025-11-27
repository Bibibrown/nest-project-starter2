import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { BookService } from './book.service';
import { BookEntity } from './entities/book.entity'; 
import { CreateBookInput } from './dto/create-book.input';
import { UpdateBookInput } from './dto/update-book.input';

@Resolver(() => BookEntity)
export class BookResolver {
  constructor(private readonly bookService: BookService) {}

  @Mutation(() => BookEntity)
  createBook(@Args('createBookInput') createBookInput: CreateBookInput) {
    return this.bookService.create(createBookInput);
  }

  @Query(() => [BookEntity], { name: 'books' })
  findAll() {
    return this.bookService.findAll();
  }

  @Query(() => BookEntity, { name: 'book' })
  findOne(@Args('id', { type: () => String }) id: string) {
    return this.bookService.findOne(id);
  }

  @Mutation(() => BookEntity)
  updateBook(@Args('updateBookInput') updateBookInput: UpdateBookInput) {
    return this.bookService.update(updateBookInput._id, updateBookInput);
  }

  @Mutation(() => BookEntity)
  removeBook(@Args('id', { type: () => String }) id: string) {
    return this.bookService.remove(id);
  }
}