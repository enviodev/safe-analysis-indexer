import { Module } from '@nestjs/common';
import { SafesController } from './safes.controller';
import { SafesV2Controller } from './safes-v2.controller';
import { MultisigTransactionsController } from './multisig-transactions.controller';
import { SafesService } from './safes.service';

@Module({
  controllers: [
    SafesController,
    SafesV2Controller,
    MultisigTransactionsController,
  ],
  providers: [SafesService],
})
export class SafesModule {}
