import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { InterviewService } from './interview.service';
import { WillsService } from '../wills/wills.service';

class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  message: string;
}

@Controller('wills/:willId/interview')
@UseGuards(JwtAuthGuard)
export class InterviewController {
  constructor(
    private interviewService: InterviewService,
    private willsService: WillsService,
  ) {}

  /** Standard (non-streaming) message endpoint */
  @Post('message')
  async sendMessage(
    @Param('willId') willId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: { id: string },
  ) {
    await this.willsService.getWill(willId, user.id);
    return this.interviewService.sendMessage(willId, dto.message);
  }

  /**
   * Part 8 — Streaming via Server-Sent Events.
   * EventSource does not support request bodies, so the message comes as a query param.
   * JWT is also passed as a query param since EventSource cannot set headers.
   */
  @Get('stream')
  async streamMessage(
    @Param('willId') willId: string,
    @Query('message') message: string,
    @CurrentUser() user: { id: string },
    @Res() res: Response,
  ) {
    await this.willsService.getWill(willId, user.id);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      for await (const chunk of this.interviewService.streamMessage(willId, message)) {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
    } finally {
      res.end();
    }
  }

  /**
   * Start the interview — generates the opening question without
   * saving a visible user message to the chat history.
   */
  @Post('start')
  async start(
    @Param('willId') willId: string,
    @CurrentUser() user: { id: string },
  ) {
    await this.willsService.getWill(willId, user.id);
    return this.interviewService.getOpeningMessage(willId);
  }
}
