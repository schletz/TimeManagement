/** Build-time configuration from Vite environment variables (not secret). */
export const config = {
  /** Apps Script /exec URL or the local dev backend. */
  apiUrl: import.meta.env.VITE_API_URL ?? '',
  /** OAuth client id for Google Identity Services. */
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  /** Dev login without Google (only works with the emulated backend). */
  devAuth: import.meta.env.VITE_DEV_AUTH === 'true',
};
