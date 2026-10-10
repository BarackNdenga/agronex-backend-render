export type OwnerEnvironment = {
  AGRONEX_OWNER_EMAIL?: string;
};

export function resolveAgronexOwnerEmail(env: OwnerEnvironment) {
  return env.AGRONEX_OWNER_EMAIL?.trim().toLowerCase() || "";
}

export function isAgronexOwnerEmail(email: string | null | undefined, configuredOwnerEmail: string) {
  return Boolean(email && configuredOwnerEmail && email.trim().toLowerCase() === configuredOwnerEmail);
}
