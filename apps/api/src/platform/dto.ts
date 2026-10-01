import { IsString, MaxLength, MinLength } from "class-validator";

export class PlatformLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}

export class DeleteOrganizationDto {
  /** The organization's slug, typed back by the operator — a guard against deleting the wrong tenant. */
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  confirmSlug!: string;
}
