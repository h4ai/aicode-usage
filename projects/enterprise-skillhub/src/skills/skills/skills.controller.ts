import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkillsService } from './skills.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { QuerySkillsDto } from './dto/query-skills.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Request } from 'express';

@Controller('skills')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  /**
   * POST /api/v1/skills — Create a new skill (PUBLISHER+)
   */
  @Post()
  @Roles('PUBLISHER', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSkillDto, @Req() req: Request) {
    return this.skillsService.create(dto, (req as any).user);
  }

  /**
   * GET /api/v1/skills — List skills with pagination & filters
   */
  @Get()
  async findAll(@Query() query: QuerySkillsDto, @Req() req: Request) {
    return this.skillsService.findAll(query, (req as any).user);
  }

  /**
   * GET /api/v1/skills/:slug — Get skill details
   */
  @Get(':slug')
  async findOne(@Param('slug') slug: string, @Req() req: Request) {
    return this.skillsService.findOne(slug, (req as any).user);
  }

  /**
   * PATCH /api/v1/skills/:slug — Update skill (owner/admin only)
   */
  @Patch(':slug')
  async update(
    @Param('slug') slug: string,
    @Body() dto: UpdateSkillDto,
    @Req() req: Request,
  ) {
    return this.skillsService.update(slug, dto, (req as any).user);
  }

  /**
   * DELETE /api/v1/skills/:slug — Soft delete (owner/admin only)
   */
  @Delete(':slug')
  async remove(@Param('slug') slug: string, @Req() req: Request) {
    return this.skillsService.remove(slug, (req as any).user);
  }

  /**
   * POST /api/v1/skills/:id/download — Increment download counter
   */
  @Post(':id/download')
  @HttpCode(HttpStatus.OK)
  async incrementDownload(@Param('id') id: string) {
    return this.skillsService.incrementCounter(id, 'downloadCount');
  }

  /**
   * POST /api/v1/skills/:id/install — Increment install counter
   */
  @Post(':id/install')
  @HttpCode(HttpStatus.OK)
  async incrementInstall(@Param('id') id: string) {
    return this.skillsService.incrementCounter(id, 'installCount');
  }
}
