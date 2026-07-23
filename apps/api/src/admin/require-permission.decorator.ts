import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "./permissions";

export const PERMISSION_KEY = "requiredPermission";

export const RequirePermission = (permission: PermissionKey) => SetMetadata(PERMISSION_KEY, permission);
