import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    const error = result.error;
    const messages = error.errors.map(
      (e) => `${e.path.join('.')}: ${e.message}`,
    );
    throw new BadRequestException({
      message: 'Validation failed',
      errors: messages,
    });
  }
}
