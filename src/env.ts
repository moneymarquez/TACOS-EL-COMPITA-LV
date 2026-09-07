export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;
  SITE_URL: string;
  SITE_TIMEZONE: string;
  RESEND_FROM_EMAIL: string;
  /** Secret. Owner's /admin password. */
  ADMIN_PASSWORD?: string;
  /** Secret. Enables catering-inquiry emails. */
  RESEND_API_KEY?: string;
}
