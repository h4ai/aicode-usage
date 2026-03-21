import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import {
  QueryUsersDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
  CreatePolicyDto,
  UpdatePolicyDto,
  UpdateSystemConfigDto,
} from './dto/admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ==========================================================
  // USER MANAGEMENT
  // ==========================================================

  @Get('users')
  async listUsers(@Query() query: QueryUsersDto) {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @Req() req: any,
  ) {
    return this.adminService.updateUserRole(id, dto.role, req.user);
  }

  @Patch('users/:id/status')
  async updateUserStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: any,
  ) {
    return this.adminService.updateUserStatus(id, dto.isActive, req.user);
  }

  // ==========================================================
  // REVIEW POLICIES
  // ==========================================================

  @Get('review-policies')
  async listPolicies() {
    return this.adminService.listPolicies();
  }

  @Post('review-policies')
  async createPolicy(@Body() dto: CreatePolicyDto) {
    return this.adminService.createPolicy(dto);
  }

  @Patch('review-policies/:id')
  async updatePolicy(@Param('id') id: string, @Body() dto: UpdatePolicyDto) {
    return this.adminService.updatePolicy(id, dto);
  }

  @Delete('review-policies/:id')
  async deletePolicy(@Param('id') id: string) {
    return this.adminService.deletePolicy(id);
  }

  // ==========================================================
  // SYSTEM CONFIG
  // ==========================================================

  @Get('system-config')
  async getSystemConfig() {
    return this.adminService.getSystemConfig();
  }

  @Patch('system-config')
  async updateSystemConfig(@Body() dto: UpdateSystemConfigDto) {
    return this.adminService.updateSystemConfig(dto.key, dto.value);
  }
}
