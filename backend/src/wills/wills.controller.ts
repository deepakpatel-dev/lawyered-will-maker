import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WillsService } from './wills.service';

@Controller('wills')
@UseGuards(JwtAuthGuard)
export class WillsController {
  constructor(private willsService: WillsService) {}

  /** Start a new will for the logged-in user */
  @Post()
  async create(@CurrentUser() user: { id: string }) {
    return this.willsService.createWill(user.id);
  }

  /** List all wills for logged-in user */
  @Get()
  async list(@CurrentUser() user: { id: string }) {
    return this.willsService.getUserWills(user.id);
  }

  /** Get full will data (for the live preview) */
  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.willsService.getWill(id, user.id);
  }
}
