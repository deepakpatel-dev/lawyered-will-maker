import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { WillsModule } from '../wills/wills.module';
import { ValidityModule } from '../validity/validity.module';

@Module({
  imports: [WillsModule, ValidityModule],
  controllers: [DocumentController],
  providers: [DocumentService],
})
export class DocumentModule {}
