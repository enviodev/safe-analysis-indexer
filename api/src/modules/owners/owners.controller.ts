import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { addressSchema } from '@/common/schemas/common.schemas';
import { OwnersService } from './owners.service';
import { getOwnerSafesQuerySchema } from './schemas/owners.schemas';
import { OwnerSafesResponseDto } from './dto/owners-api.dto';

@ApiTags('owners')
@Controller({ path: 'v2', version: '2' })
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Get('owners/:ownerAddress/safes')
  @ApiOkResponse({
    description: 'Safes where the address is an owner',
    type: OwnerSafesResponseDto,
  })
  @ApiParam({
    name: 'ownerAddress',
    description: 'Owner address (0x + 40 hex)',
    example: '0xcF580306A0c71EaEBf5B8E51cbE9F62C0DD94691',
  })
  @ApiQuery({
    name: 'chainId',
    required: true,
    type: Number,
    description: 'Chain ID',
  })
  async getSafesByOwner(
    @Param('ownerAddress', new ZodValidationPipe(addressSchema))
    ownerAddress: string,
    @Query(new ZodValidationPipe(getOwnerSafesQuerySchema))
    query: { chainId: number },
  ) {
    return this.ownersService.getSafesForOwner(query.chainId, ownerAddress);
  }
}
