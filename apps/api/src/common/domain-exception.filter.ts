import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { DomainError } from "@tdm/domain";

const STATUS_BY_CODE: Record<string, number> = {
  INVALID_VALUE: HttpStatus.BAD_REQUEST,
  SLOT_CONFLICT: HttpStatus.CONFLICT,
  CANCELLATION_WINDOW_EXPIRED: HttpStatus.BAD_REQUEST,
  REGISTRATION_REQUIRED: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
};

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.BAD_REQUEST;
    const body: Record<string, unknown> = { error: exception.code, message: exception.message };
    if ("suggestedSlots" in exception) {
      body.suggestedSlots = (exception as any).suggestedSlots;
    }
    response.status(status).json(body);
  }
}
