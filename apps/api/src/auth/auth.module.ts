import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { ConsoleOtpSender, OTP_SENDER } from "./otp-sender";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "dev-only-secret-change-me",
      signOptions: { expiresIn: "15m" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, { provide: OTP_SENDER, useClass: ConsoleOtpSender }],
  exports: [JwtAuthGuard, JwtModule, AuthService],
})
export class AuthModule {}
