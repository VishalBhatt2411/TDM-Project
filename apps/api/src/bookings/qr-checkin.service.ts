import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AUTH_SCOPE, CHECKIN_TOKEN_TTL_SECONDS } from "../auth/auth.constants";

export interface CheckInToken {
  token: string;
  expiresAt: string;
}

/** Issues and verifies the signed token encoded in a booking's QR check-in code — see CheckInBookingDto.qrToken. */
@Injectable()
export class QrCheckinService {
  constructor(private readonly jwtService: JwtService) {}

  /** A code valid until `notAfter` (the slot's end) or the token TTL, whichever is sooner. */
  issueToken(bookingId: string, notAfter: Date, now: Date = new Date()): CheckInToken {
    // At least one second, or a code requested in the slot's last moments would be signed already expired.
    const expiresInSeconds = Math.max(1, Math.min(CHECKIN_TOKEN_TTL_SECONDS, Math.floor((notAfter.getTime() - now.getTime()) / 1000)));
    const token = this.jwtService.sign({ sub: bookingId, scope: AUTH_SCOPE.CHECKIN }, { expiresIn: expiresInSeconds });
    return { token, expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString() };
  }

  verifyToken(token: string, bookingId: string): void {
    let payload: { sub: string; scope?: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException("This QR code is invalid or has expired.");
    }
    if (payload.scope !== AUTH_SCOPE.CHECKIN || payload.sub !== bookingId) {
      throw new UnauthorizedException("This QR code does not match this booking.");
    }
  }
}
