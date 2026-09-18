import axios from "axios";

// The onboarding wizard runs before any account (customer or staff) exists, so it
// carries no auth token/cookie at all — distinct from both apiClient (customer JWT)
// and adminApiClient (staff cookies).
export const onboardingApiClient = axios.create({ baseURL: "/api/v1" });
