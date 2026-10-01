import { Global, Module } from "@nestjs/common";
import { TenantResolverService } from "./tenant-resolver.service";
import { TenantMiddleware } from "./tenant.middleware";

@Global()
@Module({
  providers: [TenantResolverService, TenantMiddleware],
  exports: [TenantResolverService, TenantMiddleware],
})
export class TenancyModule {}
