import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { AssignReviewDto } from './dto/assign-review.dto';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Request } from 'express';

@Controller('reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * GET /api/v1/reviews — List reviews (paginated, filtered by role)
   */
  @Get()
  @Roles('REVIEWER', 'ADMIN')
  async findAll(@Query() query: QueryReviewsDto, @Req() req: Request) {
    return this.reviewService.findAll(query, (req as any).user);
  }

  /**
   * GET /api/v1/reviews/:id — Get review detail
   */
  @Get(':id')
  @Roles('REVIEWER', 'ADMIN')
  async findOne(@Param('id') id: string) {
    return this.reviewService.findOne(id);
  }

  /**
   * POST /api/v1/reviews/:id/assign — Claim or transfer review
   */
  @Post(':id/assign')
  @Roles('REVIEWER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignReviewDto,
    @Req() req: Request,
  ) {
    return this.reviewService.assign(id, dto, (req as any).user);
  }

  /**
   * POST /api/v1/reviews/:id/decision — Make review decision
   */
  @Post(':id/decision')
  @Roles('REVIEWER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  async decision(
    @Param('id') id: string,
    @Body() dto: ReviewDecisionDto,
    @Req() req: Request,
  ) {
    return this.reviewService.decision(id, dto, (req as any).user);
  }
}
