import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { LoginInput } from '@pharmacy/shared';
import { ERROR_CODES } from '@pharmacy/shared';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async login(input: LoginInput, ip?: string, userAgent?: string) {
    const email = input.email.trim().toLowerCase();

    // 1. Brute-force rate limiting check (Plan §11.1)
    const failedAttempts = await this.redisService.incrementFailedLogin(email);
    const ipAttempts = ip ? await this.redisService.incrementFailedLoginIp(ip) : 0;
    if (failedAttempts > 5 || ipAttempts > 30) {
      throw new ForbiddenException({
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many failed login attempts. Account temporarily locked for 15 minutes.',
      });
    }

    // 2. Find user
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
      },
      include: {
        branchRoles: {
          include: { branch: true },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: 'Invalid email or password.',
      });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: `Account is locked until ${user.lockedUntil.toISOString()}.`,
      });
    }

    // 3. Verify Argon2id password hash
    const isValid = await argon2.verify(user.passwordHash, input.password);
    if (!isValid) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
      });
      await this.auditService.log({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        ip,
      });
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: 'Invalid email or password.',
      });
    }

    // 4. Reset failed attempts upon successful login
    await this.redisService.resetFailedLogin(email);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    // 5. Generate tokens
    const branchRoles = user.branchRoles.map((br) => ({
      branchId: br.branchId,
      branchName: br.branch.name,
      role: br.role,
    }));

    const jti = crypto.randomUUID();
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        organizationId: user.organizationId,
        branchRoles: user.branchRoles.map((br) => ({
          branchId: br.branchId,
          role: br.role,
        })),
      },
      {
        jwtid: jti,
        expiresIn: '15m',
        secret: this.configService.get<string>('JWT_ACCESS_SECRET', 'pharmacy-dev-access-secret'),
      },
    );

    // Refresh token with family ID for reuse detection (Plan §11.1)
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const familyId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash,
        expiresAt,
      },
    });

    // 6. Audit log
    await this.auditService.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ip,
      after: { email: user.email, userAgent },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: user.organizationId,
        branchRoles,
      },
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
      },
    };
  }

  async refresh(rawRefreshToken: string, ip?: string) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: 'Refresh token is required.',
      });
    }

    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: {
        user: {
          include: {
            branchRoles: {
              include: { branch: true },
            },
          },
        },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: 'Invalid refresh token.',
      });
    }

    // Reuse detection: If token was already revoked, whole family is compromised! (Plan §11.1)
    if (storedToken.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: storedToken.familyId },
        data: { revokedAt: new Date() },
      });

      await this.auditService.log({
        organizationId: storedToken.user.organizationId,
        actorUserId: storedToken.userId,
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        entityType: 'RefreshToken',
        entityId: storedToken.id,
        ip,
        before: { familyId: storedToken.familyId },
      });

      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: 'Security alert: Refresh token reuse detected. All sessions revoked.',
      });
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: 'Refresh token has expired.',
      });
    }

    const user = storedToken.user;
    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: 'User account is inactive.',
      });
    }

    // Rotate atomically and only if this token has not already been consumed.
    const newRawRefreshToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(newRawRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const claimed = await this.prisma.$transaction(async (tx) => {
      const update = await tx.refreshToken.updateMany({
        where: { id: storedToken.id, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date(), replacedBy: newTokenHash },
      });
      if (!update.count) return false;
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          familyId: storedToken.familyId,
          tokenHash: newTokenHash,
          expiresAt,
        },
      });
      return true;
    });
    if (!claimed) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: storedToken.familyId },
        data: { revokedAt: new Date() },
      });
      await this.auditService.log({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        entityType: 'RefreshToken',
        entityId: storedToken.id,
        ip,
        before: { familyId: storedToken.familyId },
      });
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: 'Security alert: Refresh token reuse detected. All sessions revoked.',
      });
    }

    const jti = crypto.randomUUID();
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        organizationId: user.organizationId,
        branchRoles: user.branchRoles.map((br) => ({
          branchId: br.branchId,
          role: br.role,
        })),
      },
      {
        jwtid: jti,
        expiresIn: '15m',
        secret: this.configService.get<string>('JWT_ACCESS_SECRET', 'pharmacy-dev-access-secret'),
      },
    );

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
    };
  }

  async logout(userId: string, jti?: string, rawRefreshToken?: string) {
    if (jti) {
      // Denylist access token in Redis for remaining 15 minutes (900 seconds)
      await this.redisService.denylistToken(jti, 900);
    }

    if (rawRefreshToken) {
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await this.auditService.log({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: 'USER_LOGOUT',
        entityType: 'User',
        entityId: user.id,
      });
    }

    return { message: 'Logged out successfully' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: true,
        branchRoles: {
          include: { branch: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      isActive: user.isActive,
      organizationName: user.organization.name,
      branchRoles: user.branchRoles.map((br) => ({
        branchId: br.branchId,
        branchName: br.branch.name,
        branchCode: br.branch.code,
        role: br.role,
      })),
    };
  }
}
