export interface Money {
  amount: number;
  currency: string;
}

export interface TimeSlot {
  start: string; // ISO 8601
  end: string; // ISO 8601
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

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  error: string;
  message: string;
}
