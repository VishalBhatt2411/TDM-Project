import { Module } from "@nestjs/common";
import { DealershipConfigModule } from "../config/config.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  imports: [DealershipConfigModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
