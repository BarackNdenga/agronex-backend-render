export function getAdminLandingPath(role: string | null | undefined): string | null {
  return role === "admin" ? "/admin" : null;
}
