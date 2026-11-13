import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext } from '../../common/decorators/auth.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listBranches(organizationId: string) {
    return this.prisma.branch.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async getBranch(tenant: TenantContext, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId: tenant.organizationId },
    });
    if (
      !branch ||
      (!tenant.roles.includes('ORG_ADMIN' as any) && !tenant.allowedBranchIds.includes(branchId))
    )
      throw new NotFoundException('Branch not found.');
    return branch;
  }

  async createBranch(
    organizationId: string,
    actorUserId: string,
    data: { name: string; code: string; timezone?: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          organizationId,
          name: data.name,
          code: data.code.toUpperCase(),
          timezone: data.timezone || 'UTC',
        },
      });
      await tx.branchInvoiceCounter.create({
        data: { branchId: branch.id, lastNo: 0, year: new Date().getFullYear() },
      });
      await this.auditService.log(
        {
          organizationId,
          branchId: branch.id,
          actorUserId,
          action: 'BRANCH_CREATED',
          entityType: 'Branch',
          entityId: branch.id,
          after: branch,
        },
        tx,
      );
      return branch;
    });
  }

  async updateBranch(
    organizationId: string,
    branchId: string,
    actorUserId: string,
    data: { name?: string; timezone?: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({ where: { id: branchId, organizationId } });
      if (!branch) throw new NotFoundException('Branch not found');
      const updated = await tx.branch.update({ where: { id: branchId }, data });
      await this.auditService.log(
        {
          organizationId,
          branchId,
          actorUserId,
          action: 'BRANCH_UPDATED',
          entityType: 'Branch',
          entityId: branchId,
          before: branch,
          after: updated,
        },
        tx,
      );
      return updated;
    });
  }

  async getSettings(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, settings: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async updateSettings(organizationId: string, actorUserId: string, settings: any) {
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: organizationId } });
      if (!org) throw new NotFoundException('Organization not found');
      const updated = await tx.organization.update({
        where: { id: organizationId },
        data: { settings },
      });
      await this.auditService.log(
        {
          organizationId,
          actorUserId,
          action: 'ORG_SETTINGS_UPDATED',
          entityType: 'Organization',
          entityId: organizationId,
          before: org.settings,
          after: settings,
        },
        tx,
      );
      return updated;
    });
  }
}
