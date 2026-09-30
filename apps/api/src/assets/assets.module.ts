import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller";
import { StaffAuthModule } from "../admin/staff-auth.module";

@Module({
  imports: [StaffAuthModule],
  controllers: [AssetsController],
})
export class AssetsModule {}
