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
import { NamespacesService } from './namespaces.service';
import { CreateNamespaceDto } from './dto/create-namespace.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Request } from 'express';

@Controller('namespaces')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NamespacesController {
  constructor(private readonly namespacesService: NamespacesService) {}

  /**
   * POST /api/v1/namespaces — Create namespace (creator becomes ADMIN)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateNamespaceDto, @Req() req: Request) {
    return this.namespacesService.create(dto, (req as any).user);
  }

  /**
   * GET /api/v1/namespaces — List my namespaces
   */
  @Get()
  async findAll(@Req() req: Request) {
    return this.namespacesService.findAll((req as any).user);
  }

  /**
   * POST /api/v1/namespaces/:id/members — Add member (ADMIN only)
   */
  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @Req() req: Request,
  ) {
    return this.namespacesService.addMember(id, dto, (req as any).user);
  }

  /**
   * DELETE /api/v1/namespaces/:id/members/:userId — Remove member
   */
  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    return this.namespacesService.removeMember(id, userId, (req as any).user);
  }
}
