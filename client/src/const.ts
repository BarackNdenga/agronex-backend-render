export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/** Ouvre le formulaire commun Supabase Auth. Le retour d’administration est stocké avant l’appel. */
export const startLogin = () => {
  if (typeof window === "undefined") return;
  const target = new URL("/", window.location.origin);
  target.searchParams.set("auth", "login");
  window.location.assign(target.toString());
};
