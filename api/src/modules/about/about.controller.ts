import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { AboutService } from './about.service';
import { indexingQuerySchema } from './schemas/about.schemas';
import { AboutResponseDto, IndexingResponseDto } from './dto/about-api.dto';

@ApiTags('about')
@Controller({ path: 'v1', version: '1' })
export class AboutController {
  constructor(private readonly aboutService: AboutService) {}

  @Get('about')
  @ApiOkResponse({ description: 'Service info', type: AboutResponseDto })
  getAbout() {
    return this.aboutService.getAbout();
  }

  @Get('about/indexing')
  @ApiOkResponse({
    description: 'Indexing status (uses first chain if chainId omitted)',
    type: IndexingResponseDto,
  })
  @ApiQuery({
    name: 'chainId',
    required: false,
    type: Number,
    description: 'Chain ID; optional, defaults to first chain',
  })
  @ApiNotFoundResponse({ description: 'No chain indexing data found' })
  getIndexing(
    @Query(new ZodValidationPipe(indexingQuerySchema))
    query: {
      chainId?: number | null;
    },
  ) {
    return this.aboutService.getIndexing(query.chainId ?? null);
  }
}
