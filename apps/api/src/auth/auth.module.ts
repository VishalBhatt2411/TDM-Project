import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { ConsoleOtpSender, OTP_SENDER } from "./otp-sender";

// Global: JwtService (and the guards that depend on it — customer JwtAuthGuard,
// staff StaffAuthGuard in ./admin) needs to be resolvable from any module without
// every consumer re-importing this chain. NestJS's DI does not reliably resolve a
// dynamic module (JwtModule) re-exported through more than one level of module
// nesting, which is exactly the shape StaffAuthModule -> AuthModule -> JwtModule was.
@Global()
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
