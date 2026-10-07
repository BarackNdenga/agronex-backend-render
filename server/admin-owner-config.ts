export type OwnerEnvironment = {
  AGRONEX_OWNER_OPEN_ID?: string;
  OWNER_OPEN_ID?: string;
};

export function resolveAgronexOwnerOpenId(env: OwnerEnvironment) {
  return env.AGRONEX_OWNER_OPEN_ID?.trim() || env.OWNER_OPEN_ID?.trim() || "";
}
