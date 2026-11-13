import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, ErrorCode } from '@pharmacy/shared';

export class DomainException extends HttpException {
  constructor(
    public readonly code: ErrorCode | string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly errors?: Array<{ field?: string; message: string }>,
  ) {
    super({ code, message, errors }, status);
  }
}

export class InsufficientStockException extends DomainException {
  constructor(medicineName: string, requested: number, available: number) {
    super(
      ERROR_CODES.INSUFFICIENT_STOCK,
      `Requested ${requested} units of '${medicineName}' but only ${available} sellable units are available.`,
      HttpStatus.CONFLICT,
      [{ message: `Only ${available} available, requested ${requested}` }],
    );
  }
}

export class BatchExpiredException extends DomainException {
  constructor(medicineName: string, batchNumber: string, expiryDate: string) {
    super(
      ERROR_CODES.BATCH_EXPIRED,
      `Batch ${batchNumber} for '${medicineName}' expired on ${expiryDate} and cannot be sold.`,
      HttpStatus.CONFLICT,
      [{ message: `Batch ${batchNumber} is expired` }],
    );
  }
}

export class WouldGoNegativeException extends DomainException {
  constructor(medicineName: string, currentQty: number, delta: number) {
    super(
      ERROR_CODES.WOULD_GO_NEGATIVE,
      `Adjustment of ${delta} on '${medicineName}' (current on hand: ${currentQty}) would cause negative stock.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class IdempotencyReusedException extends DomainException {
  constructor(key: string) {
    super(
      ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
      `Idempotency key '${key}' was previously used with a different request payload.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class InvalidStateTransitionException extends DomainException {
  constructor(entity: string, from: string, to: string) {
    super(
      ERROR_CODES.INVALID_STATE_TRANSITION,
      `Cannot transition ${entity} from status '${from}' to '${to}'.`,
      HttpStatus.CONFLICT,
    );
  }
}
