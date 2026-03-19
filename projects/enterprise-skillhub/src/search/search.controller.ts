import {
  Controller,
  Get,
  Query as QueryParam,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /api/v1/search/skills — Semantic + keyword hybrid search
   */
  @Get('skills')
  async searchSkills(
    @QueryParam() query: { query: string; limit?: number; category?: string },
    @Req() req: Request,
  ) {
    const limit = Math.min(Number(query.limit) || 20, 50);
    return this.searchService.searchSkills(
      { ...query, limit },
      (req as any).user,
    );
  }
}
