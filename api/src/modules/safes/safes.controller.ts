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
import { getSafeQuerySchema } from './schemas/safes.schemas';
import { SafeCreationResponseDto, SafeDetailResponseDto } from './dto/safes-api.dto';

@ApiTags('safes')
@Controller({ path: 'v1', version: '1' })
export class SafesController {
  constructor(private readonly safesService: SafesService) {}

  @Get('safes/:address/creation')
  @ApiOkResponse({
    description: 'Safe deployment / creation metadata (fields null when not indexed)',
    type: SafeCreationResponseDto,
  })
  @ApiParam({
    name: 'address',
    description: 'Safe address (0x + 40 hex)',
    example: '0xFF040F7ffaF177b638E050E4E1de03b201bA0d1C',
  })
  @ApiQuery({
    name: 'chainId',
    required: true,
    type: Number,
    description: 'Chain ID',
  })
  @ApiNotFoundResponse({ description: 'Safe not found on the given chain' })
  async getSafeCreation(
    @Param('address', new ZodValidationPipe(addressSchema)) address: string,
    @Query(new ZodValidationPipe(getSafeQuerySchema))
    query: { chainId: number },
  ) {
    return this.safesService.getSafeCreation(query.chainId, address);
  }

  @Get('safes/:address')
  @ApiOkResponse({
    description: 'Safe wallet details',
    type: SafeDetailResponseDto,
  })
  @ApiParam({
    name: 'address',
    description: 'Safe address (0x + 40 hex)',
    example: '0xFF040F7ffaF177b638E050E4E1de03b201bA0d1C',
  })
  @ApiQuery({
    name: 'chainId',
    required: true,
    type: Number,
    description: 'Chain ID',
  })
  @ApiNotFoundResponse({ description: 'Safe not found on the given chain' })
  async getSafeByAddress(
    @Param('address', new ZodValidationPipe(addressSchema)) address: string,
    @Query(new ZodValidationPipe(getSafeQuerySchema))
    query: { chainId: number },
  ) {
    return this.safesService.getSafe(query.chainId, address);
  }
}
