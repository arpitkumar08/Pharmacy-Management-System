import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Operations')
@Controller('api/v1')
export class OpsController {
  constructor(private readonly prisma: PrismaService) {}
  @Public() @Get('health') health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
  @Public() @Get('ready') async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException({
        code: 'NOT_READY',
        message: 'Database is unavailable.',
      });
    }
  }
}
