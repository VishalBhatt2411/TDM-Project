import { Matches } from "class-validator";

/** Shape of a business-data record id (15/18-character alphanumeric) — rejects malformed ids before any lookup. */
const RECORD_ID_PATTERN = /^[a-zA-Z0-9]{15,18}$/;

export const IsRecordId = () => Matches(RECORD_ID_PATTERN, { message: "$property must be a valid record id." });
