import { ApiProperty } from '@nestjs/swagger';

export class OwnerSafeItemDto {
  @ApiProperty()
  address!: string;

  @ApiProperty({ type: [String] })
  owners!: string[];

  @ApiProperty()
  threshold!: number;

  @ApiProperty()
  nonce!: number;

  @ApiProperty({ nullable: true })
  masterCopy!: string | null;

  @ApiProperty({ nullable: true })
  fallbackHandler!: string | null;

  @ApiProperty({ nullable: true })
  guard!: string | null;

  @ApiProperty({ nullable: true })
  moduleGuard!: string | null;

  @ApiProperty({ type: [String], example: [] })
  enabledModules!: string[];
}

export class OwnerSafesResponseDto {
  @ApiProperty({ example: 1 })
  count!: number;

  @ApiProperty({ nullable: true })
  next!: string | null;

  @ApiProperty({ nullable: true })
  previous!: string | null;

  @ApiProperty({ type: [OwnerSafeItemDto] })
  results!: OwnerSafeItemDto[];
}
