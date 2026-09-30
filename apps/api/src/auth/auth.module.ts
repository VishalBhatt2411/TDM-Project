import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { NotificationsModule } from "../notifications/notifications.module";
import { EmailOtpSender, OTP_SENDER } from "./otp-sender";
import { ACCESS_TOKEN_TTL } from "./auth.constants";
import { env } from "../common/env";

// Global: JwtService (and the guards that depend on it — customer JwtAuthGuard,
// staff StaffAuthGuard in ./admin) needs to be resolvable from any module without
// every consumer re-importing this chain. NestJS's DI does not reliably resolve a
// dynamic module (JwtModule) re-exported through more than one level of module
// nesting, which is exactly the shape StaffAuthModule -> AuthModule -> JwtModule was.
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: env.jwtSecret,
      signOptions: { expiresIn: ACCESS_TOKEN_TTL },
    }),
    NotificationsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, { provide: OTP_SENDER, useClass: EmailOtpSender }],
  exports: [JwtAuthGuard, JwtModule, AuthService],
})
export class AuthModule {}
