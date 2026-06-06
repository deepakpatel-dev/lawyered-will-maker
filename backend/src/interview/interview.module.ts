import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';
import { WillsModule } from '../wills/wills.module';

@Module({
  imports: [WillsModule, ConfigModule],
  controllers: [InterviewController],
  providers: [
    InterviewService,
    {
      provide: 'ANTHROPIC_CLIENT',
      useFactory: (config: ConfigService) => {
        const key = config.get<string>('ANTHROPIC_API_KEY') || '';
        // Return a stub when no key — InterviewService.mockMode will bypass all calls
        return key && !key.includes('your-key-here')
          ? new Anthropic({ apiKey: key })
          : { messages: { create: async () => ({ content: [] }) } };
      },
      inject: [ConfigService],
    },
  ],
  exports: [InterviewService],
})
export class InterviewModule {}
