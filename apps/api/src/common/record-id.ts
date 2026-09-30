import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { Matches, ValidationOptions } from "class-validator";

/** Shape of a business-data record id (15/18-character alphanumeric) — rejects malformed ids before any lookup. */
const RECORD_ID_PATTERN = /^[a-zA-Z0-9]{15,18}$/;

export const IsRecordId = (options?: ValidationOptions) =>
  Matches(RECORD_ID_PATTERN, { message: "$property must be a valid record id.", ...options });

/** Route-param counterpart of IsRecordId: `@Param("id", ParseRecordIdPipe) id: string`. */
@Injectable()
export class ParseRecordIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!RECORD_ID_PATTERN.test(value)) throw new BadRequestException("Invalid record id.");
    return value;
  }
}
