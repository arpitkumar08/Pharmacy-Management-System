import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, IS_PUBLIC_KEY, AuthenticatedUser } from '../decorators/auth.decorator';
import { Permission, ROLE_PERMISSIONS, UserRole, ERROR_CODES } from '@pharmacy/shared';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    if (!user) {
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Access denied: user context missing.',
      });
    }

    const isOrgAdmin = user.branchRoles?.some((br) => br.role === UserRole.ORG_ADMIN);
    if (isOrgAdmin) {
      return true;
    }

    // Check branch access if a branch is specified in the request
    const requestedBranchIds = [
      request.headers['x-branch-id'],
      request.query?.branchId,
      request.body?.branchId,
      request.params?.branchId,
    ].filter((branchId): branchId is string => typeof branchId === 'string' && branchId.length > 0);
    const requestedBranchId = requestedBranchIds[0];
    const branchOptionalPaths = new Set([
      '/api/v1/branches',
      '/api/v1/categories',
      '/api/v1/suppliers',
      '/api/v1/org/settings',
      '/api/v1/users',
      '/api/v1/auth/me',
      '/api/v1/auth/logout',
    ]);
    if (
      !isOrgAdmin &&
      user.branchRoles?.length > 1 &&
      !requestedBranchId &&
      !branchOptionalPaths.has(request.path)
    ) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Select an active branch using the X-Branch-Id header.',
      });
    }

    for (const branchId of new Set(requestedBranchIds)) {
      const hasBranchAssignment = user.branchRoles?.some((br) => br.branchId === branchId);
      if (!hasBranchAssignment) {
        throw new ForbiddenException({
          code: ERROR_CODES.FORBIDDEN,
          message: 'Access denied: you do not have permission for one of the requested branches.',
        });
      }
    }

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // Collect all permissions granted to user across their assigned branch roles
    const userRoles = requestedBranchId
      ? user.branchRoles.filter((br) => br.branchId === requestedBranchId).map((br) => br.role)
      : user.branchRoles.map((br) => br.role);

    const userPermissions = new Set<string>();
    for (const role of userRoles) {
      const perms = ROLE_PERMISSIONS[role] || [];
      for (const p of perms) {
        userPermissions.add(p);
      }
    }

    const hasPermission = requiredPermissions.some((perm) => userPermissions.has(perm));
    if (!hasPermission) {
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: `Access denied: missing required permission [${requiredPermissions.join(', ')}].`,
      });
    }

    return true;
  }
}
