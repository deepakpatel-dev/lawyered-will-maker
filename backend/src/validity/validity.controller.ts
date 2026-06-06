import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ValidityService } from './validity.service';
import { WillsService } from '../wills/wills.service';

@Controller('wills/:willId/validity')
@UseGuards(JwtAuthGuard)
export class ValidityController {
  constructor(
    private validityService: ValidityService,
    private willsService: WillsService,
  ) {}

  @Get()
  async check(
    @Param('willId') willId: string,
    @CurrentUser() user: { id: string },
  ) {
    const will = await this.willsService.getWill(willId, user.id);
    return this.validityService.validate(will);
  }
}
