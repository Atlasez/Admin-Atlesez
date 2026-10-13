/** Prefix in-prototype links with Astro's base so the deployed route stays isolated. */
export const prototypePath = (path: string) => {
  if (path.startsWith("#")) return path;
  const base = import.meta.env.BASE_URL;
  return `${base}${path.replace(/^\/+/, "")}`;
};
