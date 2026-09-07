import type { Env } from './env';

export interface Truck { id: number; label: string; active: number; sort_order: number }
export interface ScheduleEntry {
  id: number; truck_id: number; date: string; start_time: string; end_time: string;
  location_name: string; street_address: string; map_link: string; note: string;
}
export interface MenuCategory { id: number; name: string; sort_order: number }
export interface MenuItem {
  id: number; category_id: number; name: string; description: string;
  price_cents: number | null; availability: 'available' | 'sold_out' | 'hidden'; sort_order: number;
}
export const PLACEMENTS = ['gallery', 'hero', 'location', 'menu', 'story', 'catering', 'contact'] as const;
export type Placement = (typeof PLACEMENTS)[number];
export interface Photo {
  id: number; r2_key: string; content_type: string; alt_text: string; placement: Placement;
  width: number | null; height: number | null; sort_order: number;
}
export interface Review { id: number; reviewer_name: string; quote: string; star_rating: number; source: string; sort_order: number }
export interface Inquiry {
  id: number; name: string; phone: string; email: string; event_date: string; headcount: number | null;
  event_location: string; message: string; submitted_at: string; notify_status: string; notify_error: string;
}

export const SETTING_KEYS = [
  'hero_headline', 'hero_headline_accent', 'hero_subline', 'location_headline', 'menu_headline', 'menu_lede',
  'story_headline', 'story_text', 'story_quote', 'catering_copy',
  'phone', 'email', 'instagram_url', 'service_area', 'hours_summary',
  'google_rating', 'google_review_count', 'google_reviews_url', 'notify_email',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
export type Settings = Record<SettingKey, string>;

export interface SiteData {
  trucks: Truck[];
  schedule: ScheduleEntry[];   // upcoming only, sorted
  categories: MenuCategory[];
  items: MenuItem[];           // non-hidden
  photos: Photo[];
  reviews: Review[];
  settings: Settings;
}

function rows<T>(r: D1Result<unknown> | undefined): T[] {
  return (r?.results ?? []) as T[];
}

export async function loadSiteData(env: Env, today: string): Promise<SiteData> {
  const [t, s, c, i, p, r, st] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM trucks WHERE active = 1 ORDER BY sort_order, id'),
    env.DB.prepare('SELECT * FROM schedule_entries WHERE date >= ?1 ORDER BY date, start_time, id').bind(today),
    env.DB.prepare('SELECT * FROM menu_categories ORDER BY sort_order, id'),
    env.DB.prepare("SELECT * FROM menu_items WHERE availability != 'hidden' ORDER BY sort_order, id"),
    env.DB.prepare('SELECT * FROM photos ORDER BY sort_order, id'),
    env.DB.prepare('SELECT * FROM reviews ORDER BY sort_order, id'),
    env.DB.prepare('SELECT key, value FROM site_settings'),
  ]);
  return {
    trucks: rows<Truck>(t),
    schedule: rows<ScheduleEntry>(s),
    categories: rows<MenuCategory>(c),
    items: rows<MenuItem>(i),
    photos: rows<Photo>(p),
    reviews: rows<Review>(r),
    settings: toSettings(rows<{ key: string; value: string }>(st)),
  };
}

export function toSettings(list: { key: string; value: string }[]): Settings {
  const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, ''])) as Settings;
  for (const { key, value } of list) if ((SETTING_KEYS as readonly string[]).includes(key)) out[key as SettingKey] = value;
  return out;
}

export async function loadSettings(env: Env): Promise<Settings> {
  const r = await env.DB.prepare('SELECT key, value FROM site_settings').all<{ key: string; value: string }>();
  return toSettings(r.results ?? []);
}
