import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.skill.findMany({
      where: { moderationStatus: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }
}
