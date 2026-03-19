import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { txHashSchema } from '@/common/schemas/common.schemas';
import { SafesService } from './safes.service';
import { getMultisigTransactionQuerySchema } from './schemas/safes.schemas';
import { MultisigTransactionItemDto } from './dto/safes-api.dto';

@ApiTags('safes')
@Controller({ path: 'v2/multisig-transactions', version: '2' })
export class MultisigTransactionsController {
  constructor(private readonly safesService: SafesService) {}

  @Get(':safeTxHash')
  @ApiOkResponse({
    description: 'Single multisig transaction by hash (execution tx hash)',
    type: MultisigTransactionItemDto,
  })
  @ApiParam({
    name: 'safeTxHash',
    description: 'Transaction hash (0x + 64 hex). Lookup by execution tx hash.',
    example:
      '0xc6e9831361374d181c69e2e3180d5bf5290cc51abcde1a5325151092f8cae90a',
  })
  @ApiQuery({
    name: 'chainId',
    required: false,
    type: Number,
    description: 'Chain ID (optional; scopes lookup to one chain)',
  })
  @ApiNotFoundResponse({ description: 'Transaction not found' })
  async getMultisigTransaction(
    @Param('safeTxHash', new ZodValidationPipe(txHashSchema)) safeTxHash: string,
    @Query(new ZodValidationPipe(getMultisigTransactionQuerySchema))
    query: { chainId?: number },
  ) {
    return this.safesService.getMultisigTransactionByHash(
      safeTxHash,
      query.chainId,
    );
  }
}
