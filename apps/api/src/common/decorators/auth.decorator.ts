import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Permission, UserRole } from '@pharmacy/shared';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  jti?: string;
  branchRoles: Array<{
    branchId: string;
    role: UserRole;
  }>;
}

export interface TenantContext {
  organizationId: string;
  branchId?: string;
  allowedBranchIds: string[];
  roles: UserRole[];
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    const requestedBranchId =
      (request.headers['x-branch-id'] as string) ||
      (request.query?.branchId as string) ||
      (request.body?.branchId as string);

    const allowedBranchIds = user?.branchRoles?.map((r) => r.branchId) || [];
    const roles = user?.branchRoles?.map((r) => r.role) || [];

    return {
      organizationId: user?.organizationId,
      branchId:
        requestedBranchId || (allowedBranchIds.length === 1 ? allowedBranchIds[0] : undefined),
      allowedBranchIds,
      roles,
    };
  },
);

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
