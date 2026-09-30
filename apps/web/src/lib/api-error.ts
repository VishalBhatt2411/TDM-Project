type ApiError = { response?: { data?: { message?: string | string[] } } };

/** The API's validation/permission message for a failed request, or a generic fallback; undefined when there's no error. */
export function errorMessage(error: unknown): string | undefined {
  const message = (error as ApiError | null)?.response?.data?.message;
  if (!message) return error ? "Something went wrong. Please try again." : undefined;
  return Array.isArray(message) ? message.join(" ") : message;
}
