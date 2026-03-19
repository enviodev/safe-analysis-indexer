import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { addressSchema } from '@/common/schemas/common.schemas';
import { SafesService } from './safes.service';
import { getMultisigTransactionsQuerySchema } from './schemas/safes.schemas';
import { MultisigTransactionsResponseDto } from './dto/safes-api.dto';

@ApiTags('safes')
@Controller({ path: 'v2/safes', version: '2' })
export class SafesV2Controller {
  constructor(private readonly safesService: SafesService) {}

  @Get(':safeAddr/multisig-transactions')
  @ApiOkResponse({
    description: 'Paginated list of multisig transactions for the Safe',
    type: MultisigTransactionsResponseDto,
  })
  @ApiParam({
    name: 'safeAddr',
    description: 'Safe address (0x + 40 hex)',
    example: '0xFF040F7ffaF177b638E050E4E1de03b201bA0d1C',
  })
  @ApiQuery({
    name: 'chainId',
    required: true,
    type: Number,
    description: 'Chain ID',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Page size (default 20, max 100)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Offset for pagination (default 0)',
  })
  @ApiNotFoundResponse({ description: 'Safe not found on the given chain' })
  async getMultisigTransactions(
    @Param('safeAddr', new ZodValidationPipe(addressSchema)) safeAddr: string,
    @Query(new ZodValidationPipe(getMultisigTransactionsQuerySchema))
    query: { chainId: number; limit: number; offset: number },
  ) {
    return this.safesService.getMultisigTransactions(
      query.chainId,
      safeAddr,
      query.limit,
      query.offset,
    );
  }
}
