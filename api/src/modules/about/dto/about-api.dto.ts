import { ApiProperty } from '@nestjs/swagger';

export class AboutResponseDto {
  @ApiProperty({ example: 'safe-envio-api' })
  name!: string;

  @ApiProperty({ example: '0.1.0' })
  version!: string;

  @ApiProperty({ description: 'Short API description' })
  api!: string;
}

export class IndexingResponseDto {
  @ApiProperty({
    example: 24690714,
    description: 'source_block: chain tip when indexing started',
  })
  currentBlockNumber!: number;

  @ApiProperty({
    example: '2026-03-19T09:56:11Z',
    nullable: true,
    description: 'From RPC eth_getBlockByNumber or null',
  })
  currentBlockTimestamp!: string | null;

  @ApiProperty({ nullable: true, description: 'ERC20 indexing not supported' })
  erc20BlockNumber!: number | null;

  @ApiProperty({ nullable: true })
  erc20BlockTimestamp!: string | null;

  @ApiProperty({ nullable: true })
  erc20Synced!: boolean | null;

  @ApiProperty({
    example: 24690775,
    description: 'progress_block: latest block indexed',
  })
  masterCopiesBlockNumber!: number;

  @ApiProperty({
    example: '2026-03-19T09:56:11Z',
    nullable: true,
    description: 'From RPC or null',
  })
  masterCopiesBlockTimestamp!: string | null;

  @ApiProperty({ example: true })
  masterCopiesSynced!: boolean;

  @ApiProperty({ example: true })
  synced!: boolean;
}
