import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ChainsService } from './chains.service';
import { ChainItemDto } from './dto/chains-api.dto';

@ApiTags('chains')
@Controller({ path: 'v1', version: '1' })
export class ChainsController {
  constructor(private readonly chainsService: ChainsService) {}

  @Get('chains')
  @ApiOkResponse({
    description: 'List of chain IDs from envio_chains',
    type: [ChainItemDto],
  })
  listChains() {
    return this.chainsService.listChains();
  }
}
