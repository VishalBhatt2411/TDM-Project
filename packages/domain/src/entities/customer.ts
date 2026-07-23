import { RegistrationRequiredError } from "../errors";
import { DrivingLicense, Email, PersonName, PhoneNumber } from "../value-objects";

export type LanguageCode = "en" | "hi" | "es" | "fr";

export interface CustomerProps {
  id: string;
  name: PersonName;
  email: Email;
  phone: PhoneNumber;
  emailVerified: boolean;
  phoneVerified: boolean;
  preferredLanguage: LanguageCode;
  marketingOptIn: boolean;
  license?: DrivingLicense;
  createdAt: Date;
}

export class Customer {
  private constructor(private props: CustomerProps) {}

  static register(input: {
    id: string;
    name: PersonName;
    email: Email;
    phone: PhoneNumber;
    preferredLanguage?: LanguageCode;
    marketingOptIn?: boolean;
  }): Customer {
    return new Customer({
      id: input.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      emailVerified: false,
      phoneVerified: false,
      preferredLanguage: input.preferredLanguage ?? "en",
      marketingOptIn: input.marketingOptIn ?? false,
      createdAt: new Date(),
    });
  }

  static restore(props: CustomerProps): Customer {
    return new Customer(props);
  }

  get id() {
    return this.props.id;
  }
  get name() {
    return this.props.name;
  }
  get email() {
    return this.props.email;
  }
  get phone() {
    return this.props.phone;
  }
  get preferredLanguage() {
    return this.props.preferredLanguage;
  }
  get marketingOptIn() {
    return this.props.marketingOptIn;
  }
  get license() {
    return this.props.license;
  }
  get createdAt() {
    return this.props.createdAt;
  }

  get isFullyVerified(): boolean {
    return this.props.emailVerified && this.props.phoneVerified;
  }

  verifyPhone(): void {
    this.props.phoneVerified = true;
  }

  verifyEmail(): void {
    this.props.emailVerified = true;
  }

  recordLicense(license: DrivingLicense): void {
    this.props.license = license;
  }

  updateProfile(input: { name?: PersonName; preferredLanguage?: LanguageCode; marketingOptIn?: boolean }): void {
    if (input.name) this.props.name = input.name;
    if (input.preferredLanguage) this.props.preferredLanguage = input.preferredLanguage;
    if (input.marketingOptIn !== undefined) this.props.marketingOptIn = input.marketingOptIn;
  }

  /** Registration-first policy: a customer must be fully verified before any booking exists for them. */
  assertCanBook(): void {
    if (!this.isFullyVerified) {
      throw new RegistrationRequiredError();
    }
  }

  toProps(): CustomerProps {
    return { ...this.props };
  }
}
