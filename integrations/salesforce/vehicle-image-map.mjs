/**
 * Maps each Toyota model directly to its own dedicated photo set under
 * apps/web/public/vehicle-images/<slug>/ — every model has independent images;
 * none are shared across models (previously these were grouped by body type,
 * which meant e.g. every SUV showed identical photos).
 *
 * Shared by seed-catalog.mjs (initial seed) and update-vehicle-images.mjs
 * (non-destructive updates to existing records).
 */
export const IMAGE_SET_BY_MODEL = {
  "Glanza": { slug: "glanza", count: 3, ext: "jpg" },
  "Urban Cruiser Taisor": { slug: "urban-cruiser-taisor", count: 2, ext: "jpg" },
  "Urban Cruiser Hyryder": { slug: "urban-cruiser-hyryder", count: 2, ext: "jpg" },
  "Rumion": { slug: "rumion", count: 3, ext: "png" },
  "Innova Crysta": { slug: "innova-crysta", count: 3, ext: "jpg" },
  "Innova Hycross": { slug: "innova-hycross", count: 3, ext: "jpg" },
  "Fortuner": { slug: "fortuner", count: 3, ext: "jpg" },
  "Fortuner Legender": { slug: "fortuner-legender", count: 3, ext: "jpg" },
  "Hilux": { slug: "hilux", count: 3, ext: "jpg" },
  "Camry": { slug: "camry", count: 3, ext: "jpg" },
  "Vellfire": { slug: "vellfire", count: 3, ext: "jpg" },
};

export function galleryUrlsFor(model) {
  const set = IMAGE_SET_BY_MODEL[model];
  if (!set) return [];
  return Array.from({ length: set.count }, (_, i) => `/vehicle-images/${set.slug}/${i + 1}.${set.ext}`);
}
