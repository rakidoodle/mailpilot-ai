export interface Bindings {
  DB: D1Database;
  OPENROUTER_API_KEY?: string;
  ALLOW_PAID_MODELS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  APP_URL?: string;
}

/** Single demo user until real authentication lands. */
export const DEMO_USER_ID = "usr_demo";
