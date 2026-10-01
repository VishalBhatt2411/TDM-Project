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

/** What customer-facing surfaces (site header, emails) are branded with — a dealership's, or the company's on a company-wide host. */
export interface BrandProfile extends DealershipBranding {
  name: string;
}

export interface DealershipProps {
  id: string;
  name: string;
  isActive: boolean;
  branding: DealershipBranding;
}

/** One dealership (rooftop group) within a tenant company — owns branches and stock. */
export class Dealership {
  private constructor(private readonly props: DealershipProps) {}

  static restore(props: DealershipProps): Dealership {
    return new Dealership(props);
  }

  get id() {
    return this.props.id;
  }
  get isActive() {
    return this.props.isActive;
  }

  toProps(): DealershipProps {
    return { ...this.props, branding: { ...this.props.branding } };
  }
}
