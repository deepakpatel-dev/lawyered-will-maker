import { Module } from '@nestjs/common';
import { ValidityController } from './validity.controller';
import { ValidityService } from './validity.service';
import { WillsModule } from '../wills/wills.module';

@Module({
  imports: [WillsModule],
  controllers: [ValidityController],
  providers: [ValidityService],
  exports: [ValidityService],
})
export class ValidityModule {}
