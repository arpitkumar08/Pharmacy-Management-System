import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { CurrentTenant, Permissions, TenantContext } from '../../common/decorators/auth.decorator';
import { PERMISSIONS } from '@pharmacy/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Permissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'View system audit trail logs' })
  @ApiResponse({ status: 200, description: 'Audit log entries list' })
  async listLogs(
    @CurrentTenant() tenant: TenantContext,
    @Query('actorUserId') actorUserId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.auditService.list(tenant.organizationId, {
      branchId: tenant.roles.includes('ORG_ADMIN' as any) ? undefined : tenant.branchId,
      actorUserId,
      action,
      entityType,
      entityId,
      from,
      to,
      page,
      limit,
    });
  }
}
