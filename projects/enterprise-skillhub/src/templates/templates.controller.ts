import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { CreateTemplateVersionDto } from './dto/create-template-version.dto';
import { QueryTemplatesDto } from './dto/query-templates.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Request } from 'express';

@Controller('templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  /**
   * POST /api/v1/templates — Create template in a namespace
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateTemplateDto, @Req() req: Request) {
    return this.templatesService.create(dto, (req as any).user);
  }

  /**
   * GET /api/v1/templates — List templates with search/filter/sort
   */
  @Get()
  async findAll(@Query() query: QueryTemplatesDto, @Req() req: Request) {
    return this.templatesService.findAll(query, (req as any).user);
  }

  /**
   * GET /api/v1/templates/resolve — Resolve template + dependencies
   * Must be before :id route to avoid conflict
   */
  @Get('resolve')
  async resolve(
    @Query('namespace') namespace: string,
    @Query('name') name: string,
    @Query('version') version?: string,
  ) {
    return this.templatesService.resolve(namespace, name, version);
  }

  /**
   * GET /api/v1/templates/:id — Template details
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.templatesService.findOne(id);
  }

  /**
   * POST /api/v1/templates/:id/versions — Upload new version (ZIP)
   */
  @Post(':id/versions')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @HttpCode(HttpStatus.CREATED)
  async createVersion(
    @Param('id') id: string,
    @Body() dto: CreateTemplateVersionDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    return this.templatesService.createVersion(id, dto, file, (req as any).user);
  }

  /**
   * GET /api/v1/templates/:id/versions/:version — Version details
   */
  @Get(':id/versions/:version')
  async getVersion(
    @Param('id') id: string,
    @Param('version') version: string,
  ) {
    return this.templatesService.getVersion(id, version);
  }

  /**
   * POST /api/v1/templates/:id/versions/:version/publish — Submit for review
   */
  @Post(':id/versions/:version/publish')
  @HttpCode(HttpStatus.OK)
  async publishVersion(
    @Param('id') id: string,
    @Param('version') version: string,
    @Req() req: Request,
  ) {
    return this.templatesService.publishVersion(id, version, (req as any).user);
  }
}
