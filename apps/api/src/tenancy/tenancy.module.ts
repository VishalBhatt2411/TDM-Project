import { Global, Module } from "@nestjs/common";
import { DealershipHostSyncScheduler } from "./dealership-host-sync.scheduler";
import { TenantResolverService } from "./tenant-resolver.service";
import { TenantMiddleware } from "./tenant.middleware";
import { CustomDomainService } from "./custom-domain.service";

@Global()
@Module({
  providers: [TenantResolverService, TenantMiddleware, DealershipHostSyncScheduler, CustomDomainService],
  exports: [TenantResolverService, TenantMiddleware, CustomDomainService, DealershipHostSyncScheduler],
})
export class TenancyModule {}
