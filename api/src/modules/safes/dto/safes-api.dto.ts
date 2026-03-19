import { ApiProperty } from '@nestjs/swagger';

export class SafeDetailResponseDto {
  @ApiProperty({ example: '0xFF040F7ffaF177b638E050E4E1de03b201bA0d1C' })
  address!: string;

  @ApiProperty({ example: '38' })
  nonce!: string;

  @ApiProperty({ example: 2 })
  threshold!: number;

  @ApiProperty({
    example: [
      '0xcF580306A0c71EaEBf5B8E51cbE9F62C0DD94691',
      '0x2F4a1e930B307F45A24830a425eF1a9c3a8Fc05d',
    ],
    type: [String],
  })
  owners!: string[];

  @ApiProperty({
    example: '0xfb1bffC9d739B8D520DaF37dF666da4C687191EA',
    nullable: true,
  })
  masterCopy!: string | null;

  @ApiProperty({ example: [], type: [String] })
  modules!: string[];

  @ApiProperty({ nullable: true })
  fallbackHandler!: string | null;

  @ApiProperty({ nullable: true })
  guard!: string | null;

  @ApiProperty({ nullable: true })
  moduleGuard!: string | null;

  @ApiProperty({ example: '1.3.0+L2' })
  version!: string;
}

export class SafeCreationResponseDto {
  @ApiProperty({ example: '2024-05-13T09:07:59Z', nullable: true })
  created!: string | null;

  @ApiProperty({ nullable: true })
  creator!: string | null;

  @ApiProperty({ nullable: true })
  transactionHash!: string | null;

  @ApiProperty({ nullable: true })
  factoryAddress!: string | null;

  @ApiProperty({ nullable: true })
  masterCopy!: string | null;

  @ApiProperty({ nullable: true })
  setupData!: string | null;

  @ApiProperty({ nullable: true })
  saltNonce!: string | null;

  @ApiProperty({ nullable: true })
  dataDecoded!: unknown;

  @ApiProperty({ nullable: true })
  userOperation!: unknown;
}

export class MultisigTransactionItemDto {
  @ApiProperty()
  safe!: string;

  @ApiProperty()
  to!: string;

  @ApiProperty({ example: '0' })
  value!: string;

  @ApiProperty({ nullable: true })
  data!: string | null;

  @ApiProperty({ example: 1 })
  operation!: number;

  @ApiProperty()
  gasToken!: string;

  @ApiProperty({ example: '0' })
  safeTxGas!: string;

  @ApiProperty({ example: '0' })
  baseGas!: string;

  @ApiProperty({ example: '0' })
  gasPrice!: string;

  @ApiProperty()
  refundReceiver!: string;

  @ApiProperty({ example: '37' })
  nonce!: string;

  @ApiProperty({ example: '2026-03-02T22:28:47Z' })
  executionDate!: string;

  @ApiProperty({ nullable: true })
  submissionDate!: string | null;

  @ApiProperty({ nullable: true })
  modified!: string | null;

  @ApiProperty({ nullable: true })
  blockNumber!: number | null;

  @ApiProperty()
  transactionHash!: string;

  @ApiProperty({ nullable: true })
  safeTxHash!: string | null;

  @ApiProperty({ nullable: true })
  proposer!: string | null;

  @ApiProperty({ nullable: true })
  proposedByDelegate!: string | null;

  @ApiProperty({ nullable: true })
  executor!: string | null;

  @ApiProperty({ example: true })
  isExecuted!: boolean;

  @ApiProperty({ nullable: true })
  isSuccessful!: boolean | null;

  @ApiProperty({ nullable: true })
  ethGasPrice!: string | null;

  @ApiProperty({ nullable: true })
  maxFeePerGas!: string | null;

  @ApiProperty({ nullable: true })
  maxPriorityFeePerGas!: string | null;

  @ApiProperty({ nullable: true })
  gasUsed!: number | null;

  @ApiProperty({ nullable: true })
  fee!: string | null;

  @ApiProperty({ nullable: true })
  origin!: string | null;

  @ApiProperty({ nullable: true })
  dataDecoded!: unknown;

  @ApiProperty({ nullable: true })
  confirmationsRequired!: number | null;

  @ApiProperty({ nullable: true, type: 'array', items: {} })
  confirmations!: unknown[] | null;

  @ApiProperty({ nullable: true })
  trusted!: boolean | null;

  @ApiProperty()
  signatures!: string;
}

export class MultisigTransactionsResponseDto {
  @ApiProperty({ example: 38 })
  count!: number;

  @ApiProperty({ nullable: true })
  next!: string | null;

  @ApiProperty({ nullable: true })
  previous!: string | null;

  @ApiProperty({ type: [MultisigTransactionItemDto] })
  results!: MultisigTransactionItemDto[];

  @ApiProperty({ example: 38 })
  countUniqueNonce!: number;
}
