import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GitCredentialService } from './git-credential.service';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('git-credentials')
@UseGuards(JwtAuthGuard)
export class GitCredentialController {
  constructor(private readonly gitCredentialService: GitCredentialService) {}

  /**
   * POST /api/v1/git-credentials — Create a new Git credential
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCredentialDto, @Req() req: Request) {
    return this.gitCredentialService.create(dto, (req as any).user.sub);
  }

  /**
   * GET /api/v1/git-credentials — List my credentials (no plaintext)
   */
  @Get()
  async findAll(@Req() req: Request) {
    return this.gitCredentialService.findAll((req as any).user.sub);
  }

  /**
   * DELETE /api/v1/git-credentials/:id — Delete a credential
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string, @Req() req: Request) {
    return this.gitCredentialService.remove(id, (req as any).user.sub);
  }

  /**
   * POST /api/v1/git-credentials/:id/test — Test credential connectivity
   */
  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  async test(@Param('id') id: string, @Req() req: Request) {
    return this.gitCredentialService.testConnectivity(id, (req as any).user.sub);
  }
}
