import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WillsController } from './wills.controller';
import { WillsService } from './wills.service';
import { Will } from './entities/will.entity';
import { Beneficiary } from './entities/beneficiary.entity';
import { Asset } from './entities/asset.entity';
import { AssetShare } from './entities/asset-share.entity';
import { Executor } from './entities/executor.entity';
import { Guardian } from './entities/guardian.entity';
import { Witness } from './entities/witness.entity';
import { ChatMessage } from './entities/chat-message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Will, Beneficiary, Asset, AssetShare, Executor, Guardian, Witness, ChatMessage,
    ]),
  ],
  controllers: [WillsController],
  providers: [WillsService],
  exports: [WillsService, TypeOrmModule],
})
export class WillsModule {}
