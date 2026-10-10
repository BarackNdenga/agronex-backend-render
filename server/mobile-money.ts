export const MOBILE_MONEY_PROVIDERS = ["orange", "airtel", "afrimoney", "mpesa"] as const;
export type MobileMoneyProvider = (typeof MOBILE_MONEY_PROVIDERS)[number];

type RuntimeGlobal = typeof globalThis & {
  Deno?: { env?: { get(name: string): string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

const runtime = globalThis as RuntimeGlobal;

export const MOBILE_MONEY_PROVIDER_LABELS: Record<MobileMoneyProvider, string> = {
  orange: "Orange Money",
  airtel: "Airtel Money",
  afrimoney: "AfriMoney",
  mpesa: "M-Pesa",
};

type ProviderEnv = {
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
  enabled: boolean;
};

const env = (name: string) => {
  try {
    return runtime.Deno?.env?.get(name)?.trim() ?? runtime.process?.env?.[name]?.trim() ?? "";
  } catch {
    return runtime.process?.env?.[name]?.trim() ?? "";
  }
};
const flag = (name: string) => env(name).toLowerCase() === "true";

/**
 * Configuration serveur uniquement. Aucun opérateur n'est actif par défaut.
 * Les clés ne sont jamais renvoyées au navigateur et aucune requête fournisseur
 * n'est lancée par ce module tant que l'activation explicite n'est pas faite.
 */
export function getMobileMoneyProviderConfig(provider: MobileMoneyProvider): ProviderEnv {
  const prefix = provider.toUpperCase();
  return {
    clientId: env(`AGRONEX_${prefix}_MONEY_CLIENT_ID`),
    clientSecret: env(`AGRONEX_${prefix}_MONEY_CLIENT_SECRET`),
    apiBaseUrl: env(`AGRONEX_${prefix}_MONEY_API_BASE_URL`),
    enabled: flag(`AGRONEX_${prefix}_MONEY_ENABLED`),
  };
}

export function isMobileMoneyProviderEnabled(provider: MobileMoneyProvider): boolean {
  const config = getMobileMoneyProviderConfig(provider);
  return config.enabled && Boolean(config.clientId && config.clientSecret && config.apiBaseUrl);
}

export function getPublicMobileMoneyProviders() {
  return MOBILE_MONEY_PROVIDERS.map((id) => ({
    id,
    label: MOBILE_MONEY_PROVIDER_LABELS[id],
    enabled: isMobileMoneyProviderEnabled(id),
  }));
}

/** Future adapter boundary. Deliberately refuses to initiate payments while the platform is paused. */
export async function initiateMobileMoneyPayment(): Promise<never> {
  throw new Error("Les paiements Mobile Money sont désactivés par défaut. Aucun paiement n’a été initié.");
}
