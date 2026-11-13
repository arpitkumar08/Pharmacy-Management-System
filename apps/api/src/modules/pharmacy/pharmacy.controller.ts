import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  CurrentTenant,
  CurrentUser,
  AuthenticatedUser,
  TenantContext,
  Permissions,
} from '../../common/decorators/auth.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  PERMISSIONS,
  UserRole,
  createSaleSchema,
  createMedicineSchema,
  createAdjustmentSchema,
  createReturnSchema,
  createPurchaseOrderSchema,
} from '@pharmacy/shared';
import { PharmacyService } from './pharmacy.service';
import { OrganizationsService } from '../organizations/organizations.service';

const receiveSchema = z.object({
  branchId: z.string().uuid(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        medicineId: z.string().uuid(),
        batchNumber: z.string().min(2),
        expiryDate: z.string(),
        qty: z.number().int().positive(),
        purchasePrice: z.number().nonnegative(),
        salePrice: z.number().nonnegative(),
      }),
    )
    .min(1),
});
const newReceiptSchema = z.object({
  branchId: z.string().uuid(),
  supplierId: z.string().uuid(),
  medicineId: z.string().uuid(),
  batchNumber: z.string().min(2).max(80),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  qty: z.number().int().positive(),
  purchasePrice: z.number().nonnegative(),
  salePrice: z.number().nonnegative(),
});
const categorySchema = z.object({ name: z.string().min(2).max(80) });
const supplierSchema = z.object({
  name: z.string().min(2).max(150),
  contact: z.string().max(150).optional().nullable(),
});
const branchSchema = z.object({
  name: z.string().min(2).max(150),
  code: z.string().min(2).max(20),
  timezone: z.string().optional(),
});
const settingsSchema = z.object({ settings: z.record(z.unknown()) });
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(150),
  password: z.string().min(12),
  branchRoles: z
    .array(z.object({ branchId: z.string().uuid(), role: z.nativeEnum(UserRole) }))
    .min(1),
});
const updateUserSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  isActive: z.boolean().optional(),
});
const branchRolesSchema = z.object({
  branchRoles: z
    .array(z.object({ branchId: z.string().uuid(), role: z.nativeEnum(UserRole) }))
    .min(1),
});

@ApiTags('Pharmacy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1')
export class PharmacyController {
  constructor(
    private readonly service: PharmacyService,
    private readonly organizations: OrganizationsService,
  ) {}

  @Get('branches') branches(@CurrentTenant() t: TenantContext) {
    return this.service.branches(t);
  }
  @Post('branches') @Permissions(PERMISSIONS.BRANCHES_MANAGE) createBranch(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(branchSchema)) b: any,
  ) {
    return this.organizations.createBranch(t.organizationId, u.id, b);
  }
  @Get('org/settings') orgSettings(@CurrentTenant() t: TenantContext) {
    return this.organizations.getSettings(t.organizationId);
  }
  @Patch('org/settings') @Permissions(PERMISSIONS.BRANCHES_MANAGE) updateOrgSettings(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(settingsSchema)) b: any,
  ) {
    return this.organizations.updateSettings(t.organizationId, u.id, b.settings);
  }
  @Get('branches/:id') branch(@CurrentTenant() t: TenantContext, @Param('id') id: string) {
    return this.organizations.getBranch(t, id);
  }
  @Patch('branches/:id') @Permissions(PERMISSIONS.BRANCHES_MANAGE) updateBranch(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(branchSchema.partial())) b: any,
  ) {
    return this.organizations.updateBranch(t.organizationId, id, u.id, b);
  }
  @Get('users') @Permissions(PERMISSIONS.USERS_MANAGE) users(@CurrentTenant() t: TenantContext) {
    return this.service.users(t.organizationId);
  }
  @Post('users') @Permissions(PERMISSIONS.USERS_MANAGE) createUser(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(createUserSchema)) b: any,
    @Req() req: any,
  ) {
    return this.service.createUser(t.organizationId, u.id, b, req.ip);
  }
  @Patch('users/:id') @Permissions(PERMISSIONS.USERS_MANAGE) updateUser(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) b: any,
    @Req() req: any,
  ) {
    return this.service.updateUser(t.organizationId, u.id, id, b, req.ip);
  }
  @Put('users/:id/branch-roles') @Permissions(PERMISSIONS.USERS_MANAGE) setUserRoles(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(branchRolesSchema)) b: any,
    @Req() req: any,
  ) {
    return this.service.setUserRoles(t.organizationId, u.id, id, b.branchRoles, req.ip);
  }
  @Get('categories') @Permissions(PERMISSIONS.CATALOG_READ) categories(
    @CurrentTenant() t: TenantContext,
  ) {
    return this.service.categories(t.organizationId);
  }
  @Post('categories') @Permissions(PERMISSIONS.CATALOG_MANAGE) category(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(categorySchema)) b: any,
    @Req() req: any,
  ) {
    return this.service.createCategory(t.organizationId, u.id, b, req.ip);
  }
  @Get('suppliers') @Permissions(PERMISSIONS.PURCHASES_READ) suppliers(
    @CurrentTenant() t: TenantContext,
  ) {
    return this.service.suppliers(t.organizationId);
  }
  @Post('suppliers') @Permissions(PERMISSIONS.PURCHASES_CREATE) supplier(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(supplierSchema)) b: any,
    @Req() req: any,
  ) {
    return this.service.createSupplier(t.organizationId, u.id, b, req.ip);
  }
  @Get('medicines') @Permissions(PERMISSIONS.CATALOG_READ) medicines(
    @CurrentTenant() t: TenantContext,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.medicines(t.organizationId, branchId || t.branchId);
  }
  @Post('medicines') @Permissions(PERMISSIONS.CATALOG_MANAGE) medicine(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(createMedicineSchema)) b: any,
    @Req() req: any,
  ) {
    return this.service.createMedicine(t.organizationId, u.id, b, req.ip);
  }
  @Get('batches') @Permissions(PERMISSIONS.INVENTORY_READ) batches(
    @CurrentTenant() t: TenantContext,
    @Query() q: any,
  ) {
    return this.service.batches(t, q);
  }
  @Get('batches/:id') @Permissions(PERMISSIONS.INVENTORY_READ) batch(
    @CurrentTenant() t: TenantContext,
    @Param('id') id: string,
  ) {
    return this.service.batch(t, id);
  }
  @Get('batches/:id/movements') @Permissions(PERMISSIONS.INVENTORY_READ) batchMovements(
    @CurrentTenant() t: TenantContext,
    @Param('id') id: string,
  ) {
    return this.service.batchMovements(t, id);
  }
  @Get('stock-movements') @Permissions(PERMISSIONS.INVENTORY_READ) movements(
    @CurrentTenant() t: TenantContext,
    @Query() q: any,
  ) {
    return this.service.movements(t, q);
  }
  @Post('stock-adjustments') @Permissions(PERMISSIONS.INVENTORY_ADJUST) adjustment(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAdjustmentSchema)) b: any,
    @Req() req: any,
  ) {
    return this.service.adjustment(t, u, b, req.ip);
  }
  @Get('sales') @Permissions(PERMISSIONS.SALES_READ) sales(
    @CurrentTenant() t: TenantContext,
    @Query() q: any,
  ) {
    return this.service.sales(t, q);
  }
  @Post('sales') @Permissions(PERMISSIONS.SALES_CREATE) sale(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(createSaleSchema)) b: any,
    @Req() req: any,
  ) {
    const key = req.headers['idempotency-key'] || b.idempotencyKey;
    return this.service.createSale(t, u, b, key, req.ip);
  }
  @Get('sales/:id') @Permissions(PERMISSIONS.SALES_READ) saleById(
    @CurrentTenant() t: TenantContext,
    @Param('id') id: string,
  ) {
    return this.service.sale(t, id);
  }
  @Post('returns') @Permissions(PERMISSIONS.RETURNS_CREATE) returns(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(createReturnSchema)) b: any,
    @Req() req: any,
  ) {
    return this.service.createReturn(t, u, b, req.ip);
  }
  @Get('returns') @Permissions(PERMISSIONS.RETURNS_READ) returnsList(
    @CurrentTenant() t: TenantContext,
  ) {
    return this.service.returns(t);
  }
  @Get('purchase-orders') @Permissions(PERMISSIONS.PURCHASES_READ) purchaseOrders(
    @CurrentTenant() t: TenantContext,
  ) {
    return this.service.purchaseOrders(t);
  }
  @Get('purchase-orders/:id') @Permissions(PERMISSIONS.PURCHASES_READ) purchaseOrderById(
    @CurrentTenant() t: TenantContext,
    @Param('id') id: string,
  ) {
    return this.service.purchaseOrder(t, id);
  }
  @Post('purchase-orders') @Permissions(PERMISSIONS.PURCHASES_CREATE) purchaseOrder(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPurchaseOrderSchema)) b: any,
    @Req() req: any,
  ) {
    return this.service.createPurchaseOrder(t, u, b, req.ip);
  }
  @Post('goods-receipts') @Permissions(PERMISSIONS.PURCHASES_RECEIVE) createAndReceive(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(newReceiptSchema)) b: any,
    @Req() req: any,
  ) {
    return this.service.createAndReceivePurchase(t, u, b, req.ip);
  }
  @Post('purchase-orders/:id/order') @Permissions(PERMISSIONS.PURCHASES_CREATE) orderPurchase(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.orderPurchase(t, u, id, req.ip);
  }
  @Post('purchase-orders/:id/receive') @Permissions(PERMISSIONS.PURCHASES_RECEIVE) receive(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(receiveSchema)) b: any,
    @Req() req: any,
  ) {
    return this.service.receivePurchase(t, u, id, b, req.ip);
  }
  @Get('reports/dashboard') @Permissions(PERMISSIONS.DASHBOARD_READ) dashboard(
    @CurrentTenant() t: TenantContext,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.dashboard(t, branchId);
  }
  @Get('reports/reconciliation') @Permissions(PERMISSIONS.REPORTS_READ) reconciliation(
    @CurrentTenant() t: TenantContext,
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.reconciliation(t, branchId, from, to);
  }
  @Get('reports/sales') @Permissions(PERMISSIONS.REPORTS_READ) salesReport(
    @CurrentTenant() t: TenantContext,
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.salesReport(t, branchId, from, to);
  }
  @Get('reports/stock-valuation') @Permissions(PERMISSIONS.REPORTS_READ) stockValuation(
    @CurrentTenant() t: TenantContext,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.stockValuation(t, branchId);
  }
  @Get('reports/expiry') @Permissions(PERMISSIONS.REPORTS_READ) expiryReport(
    @CurrentTenant() t: TenantContext,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.expiryReport(t, branchId);
  }
  @Get('alerts') @Permissions(PERMISSIONS.INVENTORY_READ) alerts(
    @CurrentTenant() t: TenantContext,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.alerts(t, branchId);
  }
}
