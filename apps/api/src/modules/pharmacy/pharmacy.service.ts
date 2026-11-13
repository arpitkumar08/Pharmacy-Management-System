import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, BatchStatus, MovementType, PurchaseOrderStatus, SaleStatus } from '@prisma/client';
import { createHash } from 'crypto';
import * as argon2 from 'argon2';
import { AuthenticatedUser, TenantContext } from '../../common/decorators/auth.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const n = (v: any) => Number(v ?? 0);
const dateOnly = (v: Date) => v.toISOString().slice(0, 10);
const money = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

@Injectable()
export class PharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  branches(t: TenantContext) {
    return this.prisma.branch.findMany({
      where: {
        organizationId: t.organizationId,
        ...(t.roles.includes('ORG_ADMIN' as any) ? {} : { id: { in: t.allowedBranchIds } }),
      },
      orderBy: { name: 'asc' },
    });
  }
  async users(org: string) {
    const rows = await this.prisma.user.findMany({
      where: { organizationId: org },
      include: { branchRoles: { include: { branch: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      branchRoles: user.branchRoles.map((role) => ({
        branchId: role.branchId,
        branchName: role.branch.name,
        role: role.role,
      })),
    }));
  }
  async createUser(org: string, actorId: string, b: any, ip?: string) {
    const branches = await this.prisma.branch.findMany({
      where: { organizationId: org, id: { in: b.branchRoles.map((r: any) => r.branchId) } },
      select: { id: true },
    });
    if (branches.length !== new Set(b.branchRoles.map((r: any) => r.branchId)).size)
      throw new BadRequestException('One or more branches are outside this organization.');
    const passwordHash = await argon2.hash(b.password);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId: org,
          email: b.email.trim().toLowerCase(),
          name: b.name.trim(),
          passwordHash,
          branchRoles: { create: b.branchRoles },
        },
        include: { branchRoles: { include: { branch: true } } },
      });
      await this.audit.log(
        {
          organizationId: org,
          actorUserId: actorId,
          action: 'USER_CREATED',
          entityType: 'User',
          entityId: user.id,
          after: { email: user.email, name: user.name, branchRoles: b.branchRoles },
          ip,
        },
        tx,
      );
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        isActive: user.isActive,
        branchRoles: user.branchRoles.map((r) => ({
          branchId: r.branchId,
          branchName: r.branch.name,
          role: r.role,
        })),
      };
    });
  }
  async updateUser(org: string, actorId: string, id: string, data: any, ip?: string) {
    const before = await this.prisma.user.findFirst({ where: { id, organizationId: org } });
    if (!before) throw new NotFoundException('User not found.');
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.user.update({ where: { id }, data });
      await this.audit.log(
        {
          organizationId: org,
          actorUserId: actorId,
          action: 'USER_UPDATED',
          entityType: 'User',
          entityId: id,
          before: { name: before.name, isActive: before.isActive },
          after: data,
          ip,
        },
        tx,
      );
      return { id: after.id, email: after.email, name: after.name, isActive: after.isActive };
    });
  }
  async setUserRoles(org: string, actorId: string, id: string, roles: any[], ip?: string) {
    const target = await this.prisma.user.findFirst({
      where: { id, organizationId: org },
      include: { branchRoles: true },
    });
    if (!target) throw new NotFoundException('User not found.');
    const branchIds = [...new Set(roles.map((r) => r.branchId))];
    const branches = await this.prisma.branch.findMany({
      where: { organizationId: org, id: { in: branchIds } },
      select: { id: true },
    });
    if (branches.length !== branchIds.length)
      throw new BadRequestException('One or more branches are outside this organization.');
    return this.prisma.$transaction(async (tx) => {
      await tx.userBranchRole.deleteMany({ where: { userId: id } });
      await tx.userBranchRole.createMany({
        data: roles.map((r) => ({ userId: id, branchId: r.branchId, role: r.role })),
      });
      const updated = await tx.user.findUniqueOrThrow({
        where: { id },
        include: { branchRoles: { include: { branch: true } } },
      });
      await this.audit.log(
        {
          organizationId: org,
          actorUserId: actorId,
          action: 'USER_BRANCH_ROLES_UPDATED',
          entityType: 'User',
          entityId: id,
          before: target.branchRoles,
          after: roles,
          ip,
        },
        tx,
      );
      return {
        id: updated.id,
        branchRoles: updated.branchRoles.map((r) => ({
          branchId: r.branchId,
          branchName: r.branch.name,
          role: r.role,
        })),
      };
    });
  }
  categories(org: string) {
    return this.prisma.category
      .findMany({
        where: { organizationId: org },
        include: { _count: { select: { medicines: true } } },
        orderBy: { name: 'asc' },
      })
      .then((rows) => rows.map((r) => ({ ...r, medicineCount: r._count.medicines })));
  }
  suppliers(org: string) {
    return this.prisma.supplier.findMany({
      where: { organizationId: org, isActive: true },
      orderBy: { name: 'asc' },
    });
  }
  async createCategory(org: string, actorId: string, b: any, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.create({ data: { organizationId: org, name: b.name } });
      await this.audit.log(
        {
          organizationId: org,
          actorUserId: actorId,
          action: 'CATEGORY_CREATED',
          entityType: 'Category',
          entityId: category.id,
          after: category,
          ip,
        },
        tx,
      );
      return category;
    });
  }
  async createSupplier(org: string, actorId: string, b: any, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: { organizationId: org, name: b.name, contact: b.contact },
      });
      await this.audit.log(
        {
          organizationId: org,
          actorUserId: actorId,
          action: 'SUPPLIER_CREATED',
          entityType: 'Supplier',
          entityId: supplier.id,
          after: supplier,
          ip,
        },
        tx,
      );
      return supplier;
    });
  }

  async medicines(org: string, branchId?: string) {
    const effectiveBranchId = branchId;
    const rows = await this.prisma.medicine.findMany({
      where: { organizationId: org, isActive: true },
      include: {
        category: true,
        batches: {
          where: {
            ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
            status: BatchStatus.ACTIVE,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((m) => ({
      id: m.id,
      organizationId: m.organizationId,
      sku: m.sku,
      name: m.name,
      genericName: m.genericName,
      categoryId: m.categoryId,
      categoryName: m.category.name,
      unit: m.unit,
      taxRate: n(m.taxRate),
      requiresPrescription: m.requiresPrescription,
      reorderLevel: m.reorderLevel,
      isActive: m.isActive,
      totalStock: m.batches.reduce((a, b) => a + b.qtyOnHand, 0),
      activeBatchCount: m.batches.filter((b) => b.qtyOnHand > 0).length,
    }));
  }

  async createMedicine(org: string, actorId: string, b: any, ip?: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: b.categoryId, organizationId: org },
    });
    if (!category) throw new BadRequestException('Category does not belong to this organization.');
    return this.prisma.$transaction(async (tx) => {
      const medicine = await tx.medicine.create({
        data: { organizationId: org, ...b },
        include: { category: true },
      });
      await this.audit.log(
        {
          organizationId: org,
          actorUserId: actorId,
          action: 'MEDICINE_CREATED',
          entityType: 'Medicine',
          entityId: medicine.id,
          after: { sku: medicine.sku, name: medicine.name },
          ip,
        },
        tx,
      );
      return {
        ...medicine,
        taxRate: n(medicine.taxRate),
        categoryName: medicine.category.name,
        totalStock: 0,
        activeBatchCount: 0,
      };
    });
  }

  async batches(t: TenantContext, q: any) {
    const branchId = q.branchId || t.branchId;
    const where: Prisma.BatchWhereInput = {
      organizationId: t.organizationId,
      ...(branchId ? { branchId } : {}),
      ...(q.medicineId ? { medicineId: q.medicineId } : {}),
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (q.filter === 'expired') where.expiryDate = { lt: today };
    const settingsRow = await this.prisma.organization.findUnique({
      where: { id: t.organizationId },
      select: { settings: true },
    });
    const nearExpiryDays = Number((settingsRow?.settings as any)?.nearExpiryDays ?? 90);
    const nearExpiryLimit = new Date(Date.now() + nearExpiryDays * 86400000);
    if (q.filter === 'near-expiry') where.expiryDate = { gte: today, lte: nearExpiryLimit };
    if (q.status) where.status = q.status;
    const rows = await this.prisma.batch.findMany({
      where,
      include: { medicine: true, branch: true },
      orderBy: [{ expiryDate: 'asc' }],
    });
    const branchFilter = branchId ? { branchId } : {};
    const totals = await this.prisma.batch.groupBy({
      by: ['medicineId'],
      where: { organizationId: t.organizationId, ...branchFilter, status: BatchStatus.ACTIVE },
      _sum: { qtyOnHand: true },
    });
    const totalByMedicine = new Map(totals.map((row) => [row.medicineId, row._sum.qtyOnHand || 0]));
    return rows
      .map((b) => ({
        id: b.id,
        organizationId: b.organizationId,
        branchId: b.branchId,
        branchName: b.branch.name,
        medicineId: b.medicineId,
        medicineName: b.medicine.name,
        medicineSku: b.medicine.sku,
        batchNumber: b.batchNumber,
        expiryDate: dateOnly(b.expiryDate),
        qtyOnHand: b.qtyOnHand,
        purchasePrice: n(b.purchasePrice),
        salePrice: n(b.salePrice),
        status: b.status,
        receivedAt: b.receivedAt.toISOString(),
        isExpired: b.expiryDate < today,
        isNearExpiry: b.expiryDate >= today && b.expiryDate <= nearExpiryLimit,
        isLowStock: (totalByMedicine.get(b.medicineId) || 0) <= b.medicine.reorderLevel,
      }))
      .filter((b) => q.filter !== 'low' || b.isLowStock);
  }
  async batch(t: TenantContext, id: string) {
    const rows = await this.batches(t, {});
    const found = rows.find((row) => row.id === id);
    if (!found) throw new NotFoundException('Batch not found.');
    return found;
  }
  async batchMovements(t: TenantContext, id: string) {
    await this.batch(t, id);
    const rows = await this.prisma.stockMovement.findMany({
      where: { organizationId: t.organizationId, batchId: id },
      include: { medicine: true, batch: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((m) => ({
      ...m,
      id: m.id.toString(),
      medicineName: m.medicine.name,
      batchNumber: m.batch.batchNumber,
      createdBy: m.createdBy || 'System',
    }));
  }

  async movements(t: TenantContext, q: any) {
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        organizationId: t.organizationId,
        ...(q.branchId || t.branchId ? { branchId: q.branchId || t.branchId } : {}),
      },
      include: { medicine: true, batch: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((m) => ({
      ...m,
      id: m.id.toString(),
      medicineName: m.medicine.name,
      batchNumber: m.batch.batchNumber,
      createdBy: m.createdBy || 'System',
    }));
  }

  async adjustment(t: TenantContext, u: AuthenticatedUser, b: any, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM batches WHERE id=${b.batchId} AND organization_id=${t.organizationId} FOR UPDATE`;
      const batch = await tx.batch.findFirst({
        where: {
          id: b.batchId,
          organizationId: t.organizationId,
          ...(t.branchId ? { branchId: t.branchId } : {}),
        },
      });
      if (!batch) throw new NotFoundException('Batch not found in this organization or branch.');
      const after = batch.qtyOnHand + b.qtyDelta;
      if (after < 0)
        throw new ConflictException({
          code: 'WOULD_GO_NEGATIVE',
          message: 'Adjustment would result in negative stock.',
        });
      await tx.batch.update({
        where: { id: batch.id },
        data: { qtyOnHand: after, status: after === 0 ? BatchStatus.DEPLETED : BatchStatus.ACTIVE },
      });
      const adjustment = await tx.stockAdjustment.create({
        data: {
          organizationId: t.organizationId,
          branchId: batch.branchId,
          batchId: batch.id,
          qtyDelta: b.qtyDelta,
          reasonCode: b.reasonCode,
          reasonNote: b.reasonNote.trim(),
          createdBy: u.id,
        },
        include: { batch: { include: { medicine: true } } },
      });
      await tx.stockMovement.create({
        data: {
          organizationId: t.organizationId,
          branchId: batch.branchId,
          batchId: batch.id,
          medicineId: batch.medicineId,
          type: MovementType.ADJUSTMENT,
          qtyDelta: b.qtyDelta,
          balanceAfter: after,
          refType: 'ADJUSTMENT',
          refId: adjustment.id,
          createdBy: u.id,
        },
      });
      await this.audit.log(
        {
          organizationId: t.organizationId,
          branchId: batch.branchId,
          actorUserId: u.id,
          action: 'STOCK_ADJUSTMENT',
          entityType: 'Batch',
          entityId: batch.id,
          before: { qtyOnHand: batch.qtyOnHand },
          after: { ...b, qtyOnHand: after },
          ip,
        },
        tx,
      );
      return {
        id: adjustment.id,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        medicineName: adjustment.batch.medicine.name,
        qtyDelta: adjustment.qtyDelta,
        reasonCode: adjustment.reasonCode,
        reasonNote: adjustment.reasonNote,
        createdBy: u.id,
        createdAt: adjustment.createdAt.toISOString(),
      };
    });
  }

  async createSale(
    t: TenantContext,
    u: AuthenticatedUser,
    b: any,
    headerKey?: string,
    ip?: string,
  ) {
    const key = String(headerKey || b.idempotencyKey || '');
    if (!key) throw new BadRequestException('Idempotency-Key header is required.');
    if (t.branchId && t.branchId !== b.branchId)
      throw new BadRequestException('Branch context does not match the sale branch.');
    const hash = createHash('sha256')
      .update(JSON.stringify({ ...b, idempotencyKey: undefined }))
      .digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.idempotencyKey.findUnique({
        where: { organizationId_key: { organizationId: t.organizationId, key } },
      });
      if (previous) {
        if (previous.requestHash !== hash)
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key was already used with a different request.',
          });
        if (previous.responseBody) return previous.responseBody;
        throw new ConflictException('A request with this idempotency key is already processing.');
      }
      await tx.idempotencyKey.create({
        data: { organizationId: t.organizationId, key, requestHash: hash, status: 'IN_PROGRESS' },
      });
      const branch = await tx.branch.findFirst({
        where: { id: b.branchId, organizationId: t.organizationId },
      });
      if (!branch) throw new NotFoundException('Branch not found.');
      let customerId = b.customerId || null;
      if (customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: customerId, organizationId: t.organizationId },
        });
        if (!customer) throw new NotFoundException('Customer not found in this organization.');
      }
      if (!customerId && b.customerName)
        customerId = (
          await tx.customer.create({
            data: {
              organizationId: t.organizationId,
              name: b.customerName,
              phone: b.customerPhone,
            },
          })
        ).id;
      const counter = await tx.branchInvoiceCounter.upsert({
        where: { branchId: branch.id },
        create: { branchId: branch.id, lastNo: 1, year: new Date().getFullYear() },
        update: { lastNo: { increment: 1 }, year: new Date().getFullYear() },
      });
      const invoiceNumber = `${branch.code}-${counter.year}-${String(counter.lastNo).padStart(6, '0')}`;
      let subtotal = 0;
      let taxTotal = 0;
      const sale = await tx.sale.create({
        data: {
          organizationId: t.organizationId,
          branchId: branch.id,
          invoiceNumber,
          cashierId: u.id,
          customerId,
          paymentMethod: b.paymentMethod,
          idempotencyKey: key,
          items: { create: [] },
        },
      });
      const outputItems: any[] = [];
      for (const item of [...b.items].sort((a: any, b: any) =>
        a.medicineId.localeCompare(b.medicineId),
      )) {
        const med = await tx.medicine.findFirst({
          where: { id: item.medicineId, organizationId: t.organizationId, isActive: true },
        });
        if (!med) throw new NotFoundException(`Medicine ${item.medicineId} not found.`);
        const batches = await tx.$queryRaw<
          any[]
        >`SELECT id, batch_number AS "batchNumber", expiry_date AS "expiryDate", qty_on_hand AS "qtyOnHand", purchase_price AS "purchasePrice", sale_price AS "salePrice" FROM batches WHERE organization_id=${t.organizationId} AND branch_id=${branch.id} AND medicine_id=${med.id} AND status='ACTIVE' AND qty_on_hand>0 AND expiry_date >= CURRENT_DATE ORDER BY expiry_date ASC, id ASC FOR UPDATE`;
        const available = batches.reduce((sum, row) => sum + Number(row.qtyOnHand), 0);
        if (available < item.qty) {
          const expiredQty = await tx.batch.aggregate({
            where: {
              organizationId: t.organizationId,
              branchId: branch.id,
              medicineId: med.id,
              status: BatchStatus.ACTIVE,
              qtyOnHand: { gt: 0 },
              expiryDate: { lt: new Date(new Date().setHours(0, 0, 0, 0)) },
            },
            _sum: { qtyOnHand: true },
          });
          const isExpiredBlock = available === 0 && (expiredQty._sum.qtyOnHand || 0) > 0;
          throw new ConflictException({
            code: isExpiredBlock ? 'BATCH_EXPIRED' : 'INSUFFICIENT_STOCK',
            message: isExpiredBlock
              ? `No unexpired stock available for ${med.name}.`
              : `Only ${available} sellable units of ${med.name} are available.`,
          });
        }
        const unitPrice = n(batches[0]?.salePrice);
        const taxRate = n(med.taxRate);
        const lineSubtotal = money(item.qty * unitPrice);
        const taxAmount = money((lineSubtotal * taxRate) / 100);
        const lineTotal = money(lineSubtotal + taxAmount);
        subtotal += lineSubtotal;
        taxTotal += taxAmount;
        const saleItem = await tx.saleItem.create({
          data: {
            saleId: sale.id,
            medicineId: med.id,
            qty: item.qty,
            unitPrice,
            taxRate,
            taxAmount,
            lineTotal,
          },
        });
        let remaining = item.qty;
        const allocations: any[] = [];
        for (const batch of batches) {
          if (!remaining) break;
          const take = Math.min(Number(batch.qtyOnHand), remaining);
          remaining -= take;
          const update = await tx.batch.updateMany({
            where: { id: batch.id, qtyOnHand: { gte: take } },
            data: {
              qtyOnHand: { decrement: take },
              ...(Number(batch.qtyOnHand) === take ? { status: BatchStatus.DEPLETED } : {}),
            },
          });
          if (!update.count)
            throw new ConflictException({
              code: 'INSUFFICIENT_STOCK',
              message: 'Stock changed during checkout. Please retry.',
            });
          const balanceAfter = Number(batch.qtyOnHand) - take;
          const alloc = await tx.saleItemAllocation.create({
            data: {
              saleItemId: saleItem.id,
              batchId: batch.id,
              qty: take,
              unitCost: n(batch.purchasePrice),
            },
          });
          await tx.stockMovement.create({
            data: {
              organizationId: t.organizationId,
              branchId: branch.id,
              batchId: batch.id,
              medicineId: med.id,
              type: MovementType.SALE,
              qtyDelta: -take,
              balanceAfter,
              refType: 'SALE',
              refId: sale.id,
              createdBy: u.id,
            },
          });
          allocations.push({
            id: alloc.id,
            saleItemId: saleItem.id,
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            expiryDate: dateOnly(batch.expiryDate),
            qty: take,
            unitCost: n(batch.purchasePrice),
          });
        }
        outputItems.push({
          id: saleItem.id,
          saleId: sale.id,
          medicineId: med.id,
          medicineName: med.name,
          medicineSku: med.sku,
          qty: item.qty,
          unitPrice,
          taxRate,
          taxAmount,
          lineTotal,
          allocations,
        });
      }
      const grandTotal = money(subtotal + taxTotal);
      await tx.sale.update({ where: { id: sale.id }, data: { subtotal, taxTotal, grandTotal } });
      const result = {
        id: sale.id,
        branchId: branch.id,
        branchName: branch.name,
        invoiceNumber,
        status: SaleStatus.COMPLETED,
        cashierId: u.id,
        cashierName: u.name,
        customerName: b.customerName || 'Walk-in Customer',
        customerPhone: b.customerPhone || null,
        subtotal: money(subtotal),
        taxTotal: money(taxTotal),
        grandTotal,
        paymentMethod: b.paymentMethod,
        idempotencyKey: key,
        createdAt: sale.createdAt.toISOString(),
        items: outputItems,
      };
      await tx.idempotencyKey.update({
        where: { organizationId_key: { organizationId: t.organizationId, key } },
        data: { status: 'DONE', responseCode: 201, responseBody: result as any },
      });
      await this.audit.log(
        {
          organizationId: t.organizationId,
          branchId: branch.id,
          actorUserId: u.id,
          action: 'SALE_CREATED',
          entityType: 'Sale',
          entityId: sale.id,
          after: { invoiceNumber, grandTotal, items: b.items.length },
          ip,
        },
        tx,
      );
      return result;
    });
  }

  async sales(t: TenantContext, q: any) {
    const rows = await this.prisma.sale.findMany({
      where: {
        organizationId: t.organizationId,
        ...(q.branchId || t.branchId ? { branchId: q.branchId || t.branchId } : {}),
      },
      include: {
        branch: true,
        cashier: true,
        customer: true,
        items: { include: { medicine: true, allocations: { include: { batch: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((s) => this.mapSale(s));
  }
  async sale(t: TenantContext, id: string) {
    const s = await this.prisma.sale.findFirst({
      where: {
        organizationId: t.organizationId,
        OR: [{ id }, { invoiceNumber: id }],
        ...(t.branchId ? { branchId: t.branchId } : {}),
      },
      include: {
        branch: true,
        cashier: true,
        customer: true,
        items: { include: { medicine: true, allocations: { include: { batch: true } } } },
      },
    });
    if (!s) throw new NotFoundException('Sale not found.');
    return this.mapSale(s);
  }
  private mapSale(s: any) {
    return {
      id: s.id,
      branchId: s.branchId,
      branchName: s.branch.name,
      invoiceNumber: s.invoiceNumber,
      status: s.status,
      cashierId: s.cashierId,
      cashierName: s.cashier.name,
      customerName: s.customer?.name || 'Walk-in Customer',
      customerPhone: s.customer?.phone || null,
      subtotal: n(s.subtotal),
      taxTotal: n(s.taxTotal),
      grandTotal: n(s.grandTotal),
      paymentMethod: s.paymentMethod,
      idempotencyKey: s.idempotencyKey,
      createdAt: s.createdAt.toISOString(),
      items: s.items.map((i: any) => ({
        id: i.id,
        saleId: i.saleId,
        medicineId: i.medicineId,
        medicineName: i.medicine.name,
        medicineSku: i.medicine.sku,
        qty: i.qty,
        unitPrice: n(i.unitPrice),
        taxRate: n(i.taxRate),
        taxAmount: n(i.taxAmount),
        lineTotal: n(i.lineTotal),
        allocations: i.allocations.map((a: any) => ({
          id: a.id,
          saleItemId: a.saleItemId,
          batchId: a.batchId,
          batchNumber: a.batch.batchNumber,
          expiryDate: dateOnly(a.batch.expiryDate),
          qty: a.qty,
          unitCost: n(a.unitCost),
        })),
      })),
    };
  }

  async createReturn(t: TenantContext, u: AuthenticatedUser, b: any, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sales WHERE id=${b.saleId} AND organization_id=${t.organizationId} FOR UPDATE`;
      const sale = await tx.sale.findFirst({
        where: {
          id: b.saleId,
          organizationId: t.organizationId,
          ...(t.branchId ? { branchId: t.branchId } : {}),
        },
        include: {
          items: { include: { allocations: { include: { batch: true, returnItems: true } } } },
        },
      });
      if (!sale || sale.status === SaleStatus.VOIDED)
        throw new NotFoundException('Sale not found or not returnable.');
      const settings = await tx.organization.findUnique({
        where: { id: t.organizationId },
        select: { settings: true },
      });
      const windowDays = Number((settings?.settings as any)?.returnWindowDays ?? 30);
      if (Date.now() - sale.createdAt.getTime() > windowDays * 86400000)
        throw new ConflictException('Sale is outside the return window.');
      let refund = 0;
      const returnItems: any[] = [];
      for (const requested of b.items) {
        const allocation = sale.items
          .flatMap((i) => i.allocations.map((a) => ({ ...a, item: i })))
          .find((a) => a.id === requested.allocationId);
        if (!allocation)
          throw new BadRequestException('Return allocation does not belong to this sale.');
        const already = allocation.returnItems.reduce((sum, r) => sum + r.qty, 0);
        if (requested.qty + already > allocation.qty)
          throw new ConflictException('Return quantity exceeds quantity originally sold.');
        const amount = money(
          n(allocation.item.unitPrice) * requested.qty * (1 + n(allocation.item.taxRate) / 100),
        );
        refund += amount;
        returnItems.push({
          allocationId: allocation.id,
          qty: requested.qty,
          disposition: requested.disposition,
          refundAmount: amount,
          allocation,
        });
      }
      const returnQuantities = new Map<string, number>();
      for (const item of returnItems)
        returnQuantities.set(
          item.allocationId,
          (returnQuantities.get(item.allocationId) || 0) + item.qty,
        );
      for (const [allocationId, additionalQty] of returnQuantities) {
        const allocation = sale.items
          .flatMap((i) => i.allocations)
          .find((a) => a.id === allocationId)!;
        const already = allocation.returnItems.reduce((sum, r) => sum + r.qty, 0);
        if (already + additionalQty > allocation.qty)
          throw new ConflictException('Return quantity exceeds quantity originally sold.');
      }
      const ret = await tx.saleReturn.create({
        data: {
          organizationId: t.organizationId,
          branchId: sale.branchId,
          saleId: sale.id,
          reasonCode: b.reasonCode,
          reasonNote: b.reasonNote.trim(),
          refundTotal: money(refund),
          createdBy: u.id,
        },
      });
      for (const item of returnItems) {
        await tx.saleReturnItem.create({
          data: {
            returnId: ret.id,
            allocationId: item.allocationId,
            qty: item.qty,
            disposition: item.disposition,
            refundAmount: item.refundAmount,
          },
        });
        if (item.disposition === 'RESTOCK' || item.disposition === 'QUARANTINE') {
          const batch = item.allocation.batch;
          const after = batch.qtyOnHand + item.qty;
          await tx.batch.update({
            where: { id: batch.id },
            data: {
              qtyOnHand: after,
              status:
                item.disposition === 'QUARANTINE' ? BatchStatus.QUARANTINED : BatchStatus.ACTIVE,
            },
          });
          await tx.stockMovement.create({
            data: {
              organizationId: t.organizationId,
              branchId: sale.branchId,
              batchId: batch.id,
              medicineId: batch.medicineId,
              type: MovementType.SALE_RETURN,
              qtyDelta: item.qty,
              balanceAfter: after,
              refType: 'SALE_RETURN',
              refId: ret.id,
              createdBy: u.id,
            },
          });
        }
      }
      const allocations = sale.items.flatMap((i) =>
        i.allocations.map((a) => ({
          a,
          returned:
            a.returnItems.reduce((sum, r) => sum + r.qty, 0) +
            returnItems.filter((x) => x.allocationId === a.id).reduce((sum, x) => sum + x.qty, 0),
        })),
      );
      const status = allocations.every((x) => x.returned >= x.a.qty)
        ? SaleStatus.RETURNED
        : SaleStatus.PARTIALLY_RETURNED;
      await tx.sale.update({ where: { id: sale.id }, data: { status } });
      await this.audit.log(
        {
          organizationId: t.organizationId,
          branchId: sale.branchId,
          actorUserId: u.id,
          action: 'SALE_RETURNED',
          entityType: 'Sale',
          entityId: sale.id,
          after: { returnId: ret.id, refund, reasonCode: b.reasonCode },
          ip,
        },
        tx,
      );
      return {
        id: ret.id,
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        branchId: sale.branchId,
        reasonCode: ret.reasonCode,
        reasonNote: ret.reasonNote,
        refundTotal: money(refund),
        createdBy: u.id,
        createdAt: ret.createdAt.toISOString(),
      };
    });
  }

  async returns(t: TenantContext) {
    const rows = await this.prisma.saleReturn.findMany({
      where: { organizationId: t.organizationId, ...(t.branchId ? { branchId: t.branchId } : {}) },
      include: {
        sale: true,
        items: {
          include: {
            allocation: { include: { batch: true, saleItem: { include: { medicine: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      saleId: r.saleId,
      invoiceNumber: r.sale.invoiceNumber,
      branchId: r.branchId,
      reasonCode: r.reasonCode,
      reasonNote: r.reasonNote,
      refundTotal: n(r.refundTotal),
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      items: r.items.map((i) => ({
        id: i.id,
        returnId: i.returnId,
        allocationId: i.allocationId,
        qty: i.qty,
        disposition: i.disposition,
        medicineName: i.allocation.saleItem.medicine.name,
        batchNumber: i.allocation.batch.batchNumber,
      })),
    }));
  }

  async createPurchaseOrder(t: TenantContext, u: AuthenticatedUser, b: any, ip?: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: b.branchId, organizationId: t.organizationId },
    });
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: b.supplierId, organizationId: t.organizationId, isActive: true },
    });
    if (!branch || !supplier || (t.branchId && t.branchId !== branch.id))
      throw new NotFoundException('Branch or supplier not found.');
    const medicines = await this.prisma.medicine.findMany({
      where: {
        id: { in: b.items.map((i: any) => i.medicineId) },
        organizationId: t.organizationId,
      },
    });
    if (medicines.length !== b.items.length)
      throw new BadRequestException('One or more medicines are invalid.');
    const subtotal = money(
      b.items.reduce((sum: number, i: any) => sum + i.qtyOrdered * i.unitCost, 0),
    );
    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          organizationId: t.organizationId,
          branchId: branch.id,
          supplierId: supplier.id,
          subtotal,
          grandTotal: subtotal,
          items: {
            create: b.items.map((i: any) => ({
              medicineId: i.medicineId,
              qtyOrdered: i.qtyOrdered,
              unitCost: i.unitCost,
            })),
          },
        },
        include: { supplier: true, items: { include: { medicine: true } } },
      });
      await this.audit.log(
        {
          organizationId: t.organizationId,
          branchId: branch.id,
          actorUserId: u.id,
          action: 'PURCHASE_ORDER_CREATED',
          entityType: 'PurchaseOrder',
          entityId: po.id,
          after: { supplierId: supplier.id, itemCount: po.items.length, grandTotal: subtotal },
          ip,
        },
        tx,
      );
      return this.mapPo(po);
    });
  }
  async createAndReceivePurchase(t: TenantContext, u: AuthenticatedUser, b: any, ip?: string) {
    if (t.branchId && t.branchId !== b.branchId)
      throw new BadRequestException('Branch context does not match receipt branch.');
    const expiry = new Date(`${b.expiryDate}T00:00:00.000Z`);
    if (!Number.isFinite(expiry.getTime()) || expiry <= new Date())
      throw new BadRequestException('Batch expiry must be a future date.');
    return this.prisma.$transaction(async (tx) => {
      const [branch, supplier, medicine] = await Promise.all([
        tx.branch.findFirst({ where: { id: b.branchId, organizationId: t.organizationId } }),
        tx.supplier.findFirst({
          where: { id: b.supplierId, organizationId: t.organizationId, isActive: true },
        }),
        tx.medicine.findFirst({
          where: { id: b.medicineId, organizationId: t.organizationId, isActive: true },
        }),
      ]);
      if (!branch || !supplier || !medicine)
        throw new NotFoundException('Branch, supplier, or medicine not found.');
      const po = await tx.purchaseOrder.create({
        data: {
          organizationId: t.organizationId,
          branchId: branch.id,
          supplierId: supplier.id,
          status: PurchaseOrderStatus.ORDERED,
          subtotal: b.qty * b.purchasePrice,
          grandTotal: b.qty * b.purchasePrice,
          items: {
            create: {
              medicineId: medicine.id,
              qtyOrdered: b.qty,
              qtyReceived: b.qty,
              unitCost: b.purchasePrice,
            },
          },
        },
        include: { items: true },
      });
      const poItem = po.items[0]!;
      const batch = await tx.batch.create({
        data: {
          organizationId: t.organizationId,
          branchId: branch.id,
          medicineId: medicine.id,
          batchNumber: b.batchNumber.trim(),
          expiryDate: expiry,
          qtyOnHand: b.qty,
          purchasePrice: b.purchasePrice,
          salePrice: b.salePrice,
          status: BatchStatus.ACTIVE,
        },
      });
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: PurchaseOrderStatus.RECEIVED, version: { increment: 1 } },
      });
      await tx.stockMovement.create({
        data: {
          organizationId: t.organizationId,
          branchId: branch.id,
          batchId: batch.id,
          medicineId: medicine.id,
          type: MovementType.PURCHASE_RECEIPT,
          qtyDelta: b.qty,
          balanceAfter: b.qty,
          refType: 'PURCHASE_ORDER',
          refId: po.id,
          createdBy: u.id,
        },
      });
      await this.audit.log(
        {
          organizationId: t.organizationId,
          branchId: branch.id,
          actorUserId: u.id,
          action: 'PURCHASE_RECEIVED',
          entityType: 'PurchaseOrder',
          entityId: po.id,
          after: { batchId: batch.id, medicineId: medicine.id, qty: b.qty },
          ip,
        },
        tx,
      );
      return {
        id: po.id,
        branchId: branch.id,
        supplierId: supplier.id,
        supplierName: supplier.name,
        status: PurchaseOrderStatus.RECEIVED,
        version: 2,
        totalAmount: money(b.qty * b.purchasePrice),
        createdAt: po.createdAt.toISOString(),
        itemsCount: 1,
        items: [
          {
            id: poItem.id,
            poId: po.id,
            medicineId: medicine.id,
            medicineName: medicine.name,
            qtyOrdered: b.qty,
            qtyReceived: b.qty,
            unitCost: b.purchasePrice,
          },
        ],
      };
    });
  }
  async purchaseOrders(t: TenantContext) {
    const rows = await this.prisma.purchaseOrder.findMany({
      where: { organizationId: t.organizationId, ...(t.branchId ? { branchId: t.branchId } : {}) },
      include: { supplier: true, items: { include: { medicine: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((po) => this.mapPo(po));
  }
  async purchaseOrder(t: TenantContext, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: {
        id,
        organizationId: t.organizationId,
        ...(t.branchId ? { branchId: t.branchId } : {}),
      },
      include: { supplier: true, items: { include: { medicine: true } } },
    });
    if (!po) throw new NotFoundException('Purchase order not found.');
    return this.mapPo(po);
  }
  private mapPo(po: any) {
    return {
      id: po.id,
      branchId: po.branchId,
      supplierId: po.supplierId,
      supplierName: po.supplier.name,
      status: po.status,
      version: po.version,
      totalAmount: n(po.grandTotal),
      createdAt: po.createdAt.toISOString(),
      itemsCount: po.items.length,
      items: po.items.map((i: any) => ({
        id: i.id,
        poId: i.poId,
        medicineId: i.medicineId,
        medicineName: i.medicine.name,
        qtyOrdered: i.qtyOrdered,
        qtyReceived: i.qtyReceived,
        unitCost: n(i.unitCost),
      })),
    };
  }
  async orderPurchase(t: TenantContext, u: AuthenticatedUser, id: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: {
          id,
          organizationId: t.organizationId,
          ...(t.branchId ? { branchId: t.branchId } : {}),
        },
      });
      if (!po) throw new NotFoundException('Purchase order not found.');
      if (po.status !== PurchaseOrderStatus.DRAFT)
        throw new ConflictException('Only draft purchase orders can be ordered.');
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: { status: PurchaseOrderStatus.ORDERED, version: { increment: 1 } },
      });
      await this.audit.log(
        {
          organizationId: t.organizationId,
          branchId: po.branchId,
          actorUserId: u.id,
          action: 'PURCHASE_ORDERED',
          entityType: 'PurchaseOrder',
          entityId: id,
          before: { status: po.status },
          after: { status: updated.status },
          ip,
        },
        tx,
      );
      return updated;
    });
  }
  async receivePurchase(t: TenantContext, u: AuthenticatedUser, id: string, b: any, ip?: string) {
    if (t.branchId && t.branchId !== b.branchId)
      throw new BadRequestException('Branch context does not match receipt branch.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id=${id} AND organization_id=${t.organizationId} AND branch_id=${b.branchId} FOR UPDATE`;
      const po = await tx.purchaseOrder.findFirst({
        where: { id, organizationId: t.organizationId, branchId: b.branchId },
        include: { items: true },
      });
      if (
        !po ||
        (po.status !== PurchaseOrderStatus.ORDERED &&
          po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED)
      )
        throw new ConflictException('Purchase order must be ordered before receiving.');
      const branch = await tx.branch.findFirst({
        where: { id: b.branchId, organizationId: t.organizationId },
      });
      if (!branch) throw new NotFoundException('Branch not found.');
      for (const row of b.items) {
        const poItem = po.items.find((i) => i.id === row.itemId && i.medicineId === row.medicineId);
        if (!poItem || poItem.qtyReceived + row.qty > poItem.qtyOrdered)
          throw new ConflictException('Received quantity exceeds the ordered quantity.');
        const expiry = new Date(`${row.expiryDate}T00:00:00.000Z`);
        if (!Number.isFinite(expiry.getTime()) || expiry <= new Date())
          throw new BadRequestException('Batch expiry must be a future date.');
        const batch = await tx.batch.create({
          data: {
            organizationId: t.organizationId,
            branchId: branch.id,
            medicineId: row.medicineId,
            batchNumber: row.batchNumber,
            expiryDate: expiry,
            qtyOnHand: row.qty,
            purchasePrice: row.purchasePrice,
            salePrice: row.salePrice,
            status: BatchStatus.ACTIVE,
          },
        });
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { qtyReceived: { increment: row.qty } },
        });
        await tx.stockMovement.create({
          data: {
            organizationId: t.organizationId,
            branchId: branch.id,
            batchId: batch.id,
            medicineId: row.medicineId,
            type: MovementType.PURCHASE_RECEIPT,
            qtyDelta: row.qty,
            balanceAfter: row.qty,
            refType: 'PURCHASE_ORDER',
            refId: po.id,
            createdBy: u.id,
          },
        });
      }
      const items = await tx.purchaseOrderItem.findMany({ where: { poId: id } });
      const status = items.every((i) => i.qtyReceived === i.qtyOrdered)
        ? PurchaseOrderStatus.RECEIVED
        : PurchaseOrderStatus.PARTIALLY_RECEIVED;
      await tx.purchaseOrder.update({ where: { id }, data: { status, version: { increment: 1 } } });
      await this.audit.log(
        {
          organizationId: t.organizationId,
          branchId: branch.id,
          actorUserId: u.id,
          action: 'PURCHASE_RECEIVED',
          entityType: 'PurchaseOrder',
          entityId: id,
          after: { items: b.items },
          ip,
        },
        tx,
      );
      return { id, status };
    });
  }

  async dashboard(t: TenantContext, requestedBranch?: string) {
    const branchId = requestedBranch || t.branchId;
    const branchScope: any = branchId ? { branchId } : {};
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const [sales, meds, batches, recent] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          organizationId: t.organizationId,
          ...branchScope,
          createdAt: { gte: today },
          status: { not: SaleStatus.VOIDED },
        },
        select: { grandTotal: true },
      }),
      this.prisma.medicine.findMany({
        where: { organizationId: t.organizationId, isActive: true },
        include: { batches: { where: { ...branchScope, status: BatchStatus.ACTIVE } } },
      }),
      this.prisma.batch.findMany({
        where: { organizationId: t.organizationId, ...branchScope, qtyOnHand: { gt: 0 } },
        include: { medicine: true },
      }),
      this.prisma.sale.findMany({
        where: { organizationId: t.organizationId, ...branchScope },
        include: {
          branch: true,
          cashier: true,
          customer: true,
          items: { include: { medicine: true, allocations: { include: { batch: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);
    const lowStock = meds
      .map((m) => ({
        medicineId: m.id,
        medicineName: m.name,
        sku: m.sku,
        currentStock: m.batches.reduce((s, b) => s + b.qtyOnHand, 0),
        reorderLevel: m.reorderLevel,
      }))
      .filter((m) => m.currentStock <= m.reorderLevel);
    const orgSettings = await this.prisma.organization.findUnique({
      where: { id: t.organizationId },
      select: { settings: true },
    });
    const nearDays = Number((orgSettings?.settings as any)?.nearExpiryDays ?? 90);
    const nearLimit = new Date(Date.now() + nearDays * 86400000);
    const nearExpiry = batches
      .filter((b) => b.expiryDate >= today && b.expiryDate <= nearLimit)
      .map((b) => ({
        batchId: b.id,
        medicineName: b.medicine.name,
        batchNumber: b.batchNumber,
        expiryDate: dateOnly(b.expiryDate),
        qtyOnHand: b.qtyOnHand,
        daysRemaining: Math.ceil((b.expiryDate.getTime() - today.getTime()) / 86400000),
      }));
    return {
      todaySalesAmount: money(sales.reduce((s, x) => s + n(x.grandTotal), 0)),
      todaySalesCount: sales.length,
      lowStockItemsCount: lowStock.length,
      nearExpiryBatchesCount: nearExpiry.length,
      expiredBatchesCount: batches.filter((b) => b.expiryDate < today).length,
      totalActiveMedicines: meds.length,
      recentSales: recent.map((s) => this.mapSale(s)),
      alerts: { lowStock, nearExpiry },
    };
  }

  async alerts(t: TenantContext, branchId?: string) {
    const stats = await this.dashboard(t, branchId);
    return stats.alerts;
  }

  async salesReport(t: TenantContext, branchId?: string, from?: string, to?: string) {
    const start = from
      ? new Date(from)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
    const rows = await this.prisma.sale.findMany({
      where: {
        organizationId: t.organizationId,
        ...(branchId || t.branchId ? { branchId: branchId || t.branchId } : {}),
        createdAt: { gte: start, lte: end },
        status: { not: SaleStatus.VOIDED },
      },
      include: {
        branch: true,
        cashier: true,
        customer: true,
        items: { include: { medicine: true, allocations: { include: { batch: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      saleCount: rows.length,
      totalSales: money(rows.reduce((sum, row) => sum + n(row.grandTotal), 0)),
      sales: rows.map((row) => this.mapSale(row)),
    };
  }

  async stockValuation(t: TenantContext, branchId?: string) {
    const rows = await this.prisma.batch.findMany({
      where: {
        organizationId: t.organizationId,
        ...(branchId || t.branchId ? { branchId: branchId || t.branchId } : {}),
        qtyOnHand: { gt: 0 },
      },
      include: { medicine: true, branch: true },
      orderBy: [{ branch: { name: 'asc' } }, { medicine: { name: 'asc' } }],
    });
    const batches = rows.map((batch) => ({
      batchId: batch.id,
      branchId: batch.branchId,
      branchName: batch.branch.name,
      medicineId: batch.medicineId,
      medicineName: batch.medicine.name,
      sku: batch.medicine.sku,
      batchNumber: batch.batchNumber,
      qtyOnHand: batch.qtyOnHand,
      unitCost: n(batch.purchasePrice),
      value: money(batch.qtyOnHand * n(batch.purchasePrice)),
      expiryDate: dateOnly(batch.expiryDate),
    }));
    return { totalValue: money(batches.reduce((sum, batch) => sum + batch.value, 0)), batches };
  }

  async expiryReport(t: TenantContext, branchId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = await this.prisma.batch.findMany({
      where: {
        organizationId: t.organizationId,
        ...(branchId || t.branchId ? { branchId: branchId || t.branchId } : {}),
        qtyOnHand: { gt: 0 },
      },
      include: { medicine: true, branch: true },
      orderBy: { expiryDate: 'asc' },
    });
    return rows.map((batch) => ({
      batchId: batch.id,
      branchId: batch.branchId,
      branchName: batch.branch.name,
      medicineId: batch.medicineId,
      medicineName: batch.medicine.name,
      batchNumber: batch.batchNumber,
      qtyOnHand: batch.qtyOnHand,
      expiryDate: dateOnly(batch.expiryDate),
      daysRemaining: Math.ceil((batch.expiryDate.getTime() - today.getTime()) / 86400000),
      isExpired: batch.expiryDate < today,
    }));
  }

  async reconciliation(t: TenantContext, branchId?: string, from?: string, to?: string) {
    const selected = branchId || t.branchId;
    if (!selected) throw new BadRequestException('Select a branch to generate reconciliation.');
    const branch = await this.prisma.branch.findFirst({
      where: { id: selected, organizationId: t.organizationId },
    });
    if (!branch) throw new NotFoundException('Branch not found.');
    const start = from
      ? new Date(from)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
    const meds = await this.prisma.medicine.findMany({
      where: { organizationId: t.organizationId },
      include: {
        stockMovements: { where: { branchId: selected, createdAt: { lte: end } } },
        batches: { where: { branchId: selected } },
      },
    });
    const items = meds
      .map((m) => {
        const prior = m.stockMovements
          .filter((x) => x.createdAt < start)
          .reduce((s, x) => s + x.qtyDelta, 0);
        const period = m.stockMovements.filter((x) => x.createdAt >= start && x.createdAt <= end);
        const openingInPeriod = period
          .filter((x) => x.type === MovementType.OPENING)
          .reduce((sum, x) => sum + x.qtyDelta, 0);
        const openingStock = prior + openingInPeriod;
        const purchases = period
          .filter((x) => x.type === MovementType.PURCHASE_RECEIPT)
          .reduce((s, x) => s + x.qtyDelta, 0);
        const sales = -period
          .filter((x) => x.type === MovementType.SALE)
          .reduce((s, x) => s + x.qtyDelta, 0);
        const returns = period
          .filter((x) => x.type === MovementType.SALE_RETURN)
          .reduce((s, x) => s + x.qtyDelta, 0);
        const adjustments = period
          .filter(
            (x) =>
              ![
                MovementType.PURCHASE_RECEIPT,
                MovementType.SALE,
                MovementType.SALE_RETURN,
                MovementType.OPENING,
              ].includes(x.type as any),
          )
          .reduce((s, x) => s + x.qtyDelta, 0);
        const calculatedClosing = openingStock + purchases - sales + returns + adjustments;
        const actualClosing = m.batches.reduce((s, b) => s + b.qtyOnHand, 0);
        const variance = actualClosing - calculatedClosing;
        return {
          medicineId: m.id,
          medicineName: m.name,
          sku: m.sku,
          openingStock,
          purchases,
          sales,
          returns,
          adjustments,
          calculatedClosing,
          actualClosing,
          variance,
          isReconciled: variance === 0,
        };
      })
      .filter(
        (x) =>
          x.openingStock || x.purchases || x.sales || x.returns || x.adjustments || x.actualClosing,
      );
    return {
      branchId: selected,
      branchName: branch.name,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      items,
      allReconciled: items.every((x) => x.isReconciled),
    };
  }
}
