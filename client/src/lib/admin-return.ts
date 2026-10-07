export const ADMIN_RETURN_TARGET_KEY = "agronex-post-auth-return";

export function getAdminReturnTarget(target: string | null, isAuthenticated: boolean) {
  if (target !== "/admin" || !isAuthenticated) return null;
  return "/admin";
}
