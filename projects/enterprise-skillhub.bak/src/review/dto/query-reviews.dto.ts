import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum ReviewStatusFilter {
  PENDING_AUTO = 'PENDING_AUTO',
  AUTO_REJECTED = 'AUTO_REJECTED',
  PENDING_MANUAL = 'PENDING_MANUAL',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  REVISION_REQUESTED = 'REVISION_REQUESTED',
}

export class QueryReviewsDto {
  @IsOptional()
  @IsEnum(ReviewStatusFilter)
  status?: ReviewStatusFilter;

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
