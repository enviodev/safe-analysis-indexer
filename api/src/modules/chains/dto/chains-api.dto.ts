import { ApiProperty } from '@nestjs/swagger';

export class ChainItemDto {
  @ApiProperty({ example: 1, description: 'Chain ID' })
  chainId!: number;
}
