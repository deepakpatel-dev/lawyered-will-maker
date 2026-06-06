import { Controller, Get, Param, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DocumentService } from './document.service';
import { WillsService } from '../wills/wills.service';

@Controller('wills/:willId/document')
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(
    private documentService: DocumentService,
    private willsService: WillsService,
  ) {}

  @Get('download')
  async download(
    @Param('willId') willId: string,
    @CurrentUser() user: { id: string },
    @Res() res: Response,
  ) {
    const will = await this.willsService.getWill(willId, user.id);
    const pdfBuffer = await this.documentService.generatePdf(will);

    const filename = `will-${will.testatorName?.replace(/\s+/g, '-') || willId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  }
}
