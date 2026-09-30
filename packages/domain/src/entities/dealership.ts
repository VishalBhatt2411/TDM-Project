export interface DealershipBranding {
  tagline?: string;
  logoText?: string;
  logoUrl?: string;
  /** "#RRGGBB" — validated by the data provider. */
  primaryColorHex?: string;
  phone?: string;
  email?: string;
  address?: string;
  operatingHours?: string;
}

export interface DealershipProps {
  id: string;
  name: string;
  /** Platform subdomain label: "<urlSlug>.<base domain>". Lowercase letters, digits and single hyphens. */
  urlSlug: string;
  /** The dealer's own hostname (lowercase, no port), if they serve the customer app from one. */
  customDomain?: string;
  isActive: boolean;
  branding: DealershipBranding;
}

/** One dealership (rooftop group) within a tenant company — owns branches, stock and its own customer URL. */
export class Dealership {
  private constructor(private readonly props: DealershipProps) {}

  static restore(props: DealershipProps): Dealership {
    return new Dealership(props);
  }

  get id() {
    return this.props.id;
  }
  get urlSlug() {
    return this.props.urlSlug;
  }
  get customDomain() {
    return this.props.customDomain;
  }
  get isActive() {
    return this.props.isActive;
  }

  toProps(): DealershipProps {
    return { ...this.props, branding: { ...this.props.branding } };
  }
}
