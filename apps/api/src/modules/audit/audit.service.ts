import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreateAuditLogParams {
  organizationId: string;
  branchId?: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: any;
  after?: any;
  requestId?: string;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: CreateAuditLogParams, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.auditLog.create({
      data: {
        organizationId: params.organizationId,
        branchId: params.branchId,
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        before: params.before ? (params.before as Prisma.InputJsonValue) : undefined,
        after: params.after ? (params.after as Prisma.InputJsonValue) : undefined,
        requestId: params.requestId,
        ip: params.ip,
      },
    });
  }

  async list(
    orgId: string,
    query: {
      actorUserId?: string;
      action?: string;
      entityType?: string;
      entityId?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
      branchId?: string;
    },
  ) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 25, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      organizationId: orgId,
    };
    if (query.branchId) where.branchId = query.branchId;

    if (query.actorUserId) where.actorUserId = query.actorUserId;
    if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          actor: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    return {
      items: items.map((log) => ({
        ...log,
        id: log.id.toString(),
        actorEmail: log.actor?.email || null,
        actorName: log.actor?.name || null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
