import { InvalidValueError } from "./errors";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export class Email {
  private constructor(public readonly value: string) {}

  static create(raw: string): Email {
    const normalized = raw.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
      throw new InvalidValueError(`"${raw}" is not a valid email address.`);
    }
    return new Email(normalized);
  }

  toString(): string {
    return this.value;
  }
}

export class PhoneNumber {
  private constructor(public readonly value: string) {}

  /** Expects E.164 format, e.g. +14155552671 */
  static create(raw: string): PhoneNumber {
    const normalized = raw.trim().replace(/[\s()-]/g, "");
    if (!E164_PATTERN.test(normalized)) {
      throw new InvalidValueError(
        `"${raw}" is not a valid phone number. Use E.164 format, e.g. +14155552671.`,
      );
    }
    return new PhoneNumber(normalized);
  }

  toString(): string {
    return this.value;
  }
}

export class PersonName {
  private constructor(
    public readonly firstName: string,
    public readonly lastName: string,
  ) {}

  static create(firstName: string, lastName: string): PersonName {
    if (!firstName.trim() || !lastName.trim()) {
      throw new InvalidValueError("First and last name are both required.");
    }
    return new PersonName(firstName.trim(), lastName.trim());
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}

export class TimeSlot {
  private constructor(
    public readonly start: Date,
    public readonly end: Date,
  ) {}

  static create(start: Date | string, end: Date | string): TimeSlot {
    const startDate = typeof start === "string" ? new Date(start) : start;
    const endDate = typeof end === "string" ? new Date(end) : end;
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new InvalidValueError("Time slot start/end must be valid dates.");
    }
    if (endDate.getTime() <= startDate.getTime()) {
      throw new InvalidValueError("Time slot end must be after start.");
    }
    return new TimeSlot(startDate, endDate);
  }

  overlaps(other: TimeSlot): boolean {
    return this.start.getTime() < other.end.getTime() && other.start.getTime() < this.end.getTime();
  }

  toJSON() {
    return { start: this.start.toISOString(), end: this.end.toISOString() };
  }
}

export class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: string,
  ) {}

  static create(amount: number, currency = "USD"): Money {
    if (amount < 0) {
      throw new InvalidValueError("Money amount cannot be negative.");
    }
    return new Money(Math.round(amount * 100) / 100, currency);
  }
}

export interface Address {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export class DrivingLicense {
  private constructor(
    public readonly number: string,
    public readonly verified: boolean,
    public readonly expiryDate?: Date,
  ) {}

  static create(number: string, verified = false, expiryDate?: Date): DrivingLicense {
    if (!number.trim()) {
      throw new InvalidValueError("Driving license number cannot be empty.");
    }
    return new DrivingLicense(number.trim(), verified, expiryDate);
  }

  isExpired(asOf: Date = new Date()): boolean {
    return this.expiryDate ? this.expiryDate.getTime() < asOf.getTime() : false;
  }
}
