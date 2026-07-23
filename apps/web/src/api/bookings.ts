import type {
  BookingConflictError,
  BookingDto,
  CreateBookingRequest,
  CreateBookingResponse,
  CreatePublicBookingRequest,
  RescheduleBookingRequest,
  SubmitSurveyRequest,
} from "@tdm/types";
import { apiClient } from "@/lib/api-client";

export async function createPublicBooking(input: CreatePublicBookingRequest): Promise<CreateBookingResponse> {
  const { data } = await apiClient.post<CreateBookingResponse>("/bookings/public", input);
  return data;
}

export async function createBooking(input: CreateBookingRequest): Promise<CreateBookingResponse> {
  const { data } = await apiClient.post<CreateBookingResponse>("/bookings", input);
  return data;
}

export async function listMyBookings(): Promise<BookingDto[]> {
  const { data } = await apiClient.get<BookingDto[]>("/bookings");
  return data;
}

export async function cancelBooking(id: string, reason: string): Promise<BookingDto> {
  const { data } = await apiClient.post<BookingDto>(`/bookings/${id}/cancel`, { reason });
  return data;
}

export async function rescheduleBooking(id: string, request: RescheduleBookingRequest): Promise<BookingDto> {
  const { data } = await apiClient.post<BookingDto>(`/bookings/${id}/reschedule`, request);
  return data;
}

export async function submitSurvey(id: string, request: SubmitSurveyRequest): Promise<{ opportunityCreated: boolean }> {
  const { data } = await apiClient.post<{ opportunityCreated: boolean }>(`/bookings/${id}/survey`, request);
  return data;
}

export function isBookingConflictError(error: unknown): error is { response: { data: BookingConflictError } } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as any).response?.data?.error === "SLOT_CONFLICT"
  );
}
