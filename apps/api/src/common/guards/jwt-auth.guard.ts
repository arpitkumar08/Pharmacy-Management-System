import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, AuthenticatedUser } from '../decorators/auth.decorator';
import { RedisService } from '../../modules/redis/redis.service';
import { ERROR_CODES } from '@pharmacy/shared';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: 'Authentication token is missing. Please sign in.',
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);

      // Check if access token has been denylisted (e.g. after logout)
      if (payload.jti) {
        const isDenylisted = await this.redisService.isTokenDenylisted(payload.jti);
        if (isDenylisted) {
          throw new UnauthorizedException({
            code: ERROR_CODES.UNAUTHENTICATED,
            message: 'Session has been revoked. Please sign in again.',
          });
        }
      }

      request['user'] = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        organizationId: payload.organizationId,
        jti: payload.jti,
        branchRoles: payload.branchRoles || [],
      } as AuthenticatedUser;

      return true;
    } catch {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: 'Invalid or expired authentication token. Please sign in again.',
      });
    }
  }

  private extractToken(request: Request): string | null {
    if (request.cookies && request.cookies.accessToken) {
      return request.cookies.accessToken;
    }

    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }
}
