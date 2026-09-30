import { Global, Module } from "@nestjs/common";
import { DealershipHostSyncScheduler } from "./dealership-host-sync.scheduler";
import { TenantResolverService } from "./tenant-resolver.service";
import { TenantMiddleware } from "./tenant.middleware";

@Global()
@Module({
  providers: [TenantResolverService, TenantMiddleware, DealershipHostSyncScheduler],
  exports: [TenantResolverService, TenantMiddleware],
})
export class TenancyModule {}
