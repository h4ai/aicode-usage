import { IsOptional, IsString, IsInt, Min, Max, IsEnum, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryUsersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

export class UpdateUserRoleDto {
  @IsString()
  role: string;
}

export class UpdateUserStatusDto {
  @IsBoolean()
  isActive: boolean;
}

export class CreatePolicyDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  autoApproveMinScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  requiredReviews?: number;

  @IsOptional()
  reviewerAdGroups?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxReviewDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  timeoutHours?: number;

  @IsOptional()
  @IsBoolean()
  blockOnSecurityFail?: boolean;

  @IsOptional()
  @IsBoolean()
  blockOnLicenseFail?: boolean;

  @IsOptional()
  requiredFiles?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePolicyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  autoApproveMinScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  requiredReviews?: number;

  @IsOptional()
  reviewerAdGroups?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxReviewDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  timeoutHours?: number;

  @IsOptional()
  @IsBoolean()
  blockOnSecurityFail?: boolean;

  @IsOptional()
  @IsBoolean()
  blockOnLicenseFail?: boolean;

  @IsOptional()
  requiredFiles?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSystemConfigDto {
  @IsString()
  key: string;

  value: any;
}
