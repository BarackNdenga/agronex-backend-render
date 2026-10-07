type RuntimeEnvironment = Record<string, unknown>;

let cloudflareEnvironment: RuntimeEnvironment | undefined;

/** Set once by the Cloudflare Worker bootstrap; bindings are static per deployment. */
export function setCloudflareEnvironment(environment: RuntimeEnvironment) {
  cloudflareEnvironment = environment;
}

export function getRuntimeBinding<T = unknown>(name: string): T | undefined {
  const value = cloudflareEnvironment?.[name];
  return value as T | undefined;
}

export function getRuntimeVariable(name: string): string | undefined {
  const bindingValue = cloudflareEnvironment?.[name];
  if (typeof bindingValue === "string") return bindingValue;
  return process.env[name];
}
