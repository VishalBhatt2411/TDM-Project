import { Equals, IsBase64, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, Length, MaxLength } from "class-validator";

export const ALLOWED_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export class SubmitComplianceDto {
  @IsString()
  @Length(1, 40)
  licenseNumber!: string;

  @IsBase64()
  @MaxLength(8_000_000)
  licenseImageBase64!: string;

  @IsIn(ALLOWED_IMAGE_CONTENT_TYPES)
  licenseImageContentType!: string;

  @IsOptional()
  @IsISO8601()
  licenseExpiryDate?: string;

  @IsBoolean()
  @Equals(true, { message: "Consent must be accepted to proceed." })
  consentAccepted!: boolean;

  @IsBase64()
  @MaxLength(8_000_000)
  signatureImageBase64!: string;

  @IsIn(ALLOWED_IMAGE_CONTENT_TYPES)
  signatureImageContentType!: string;
}
