import { isAxiosError } from "axios";

type ApiError = { response?: { data?: { message?: string | string[] } } };

/**
 * The API's validation/permission message for a failed request, or `fallback` when the response carries
 * none (network failure, 5xx without a body); undefined when there's no error.
 */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string | undefined {
  const message = (error as ApiError | null)?.response?.data?.message;
  if (!message) {
    // Client-side validation errors (e.g. an oversized photo) carry their own user-facing text.
    if (error instanceof Error && !isAxiosError(error) && error.message) return error.message;
    return error ? fallback : undefined;
  }
  return Array.isArray(message) ? message.join(" ") : message;
}
