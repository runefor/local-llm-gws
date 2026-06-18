export type LlmServeMode = "llamacpp" | "ollama" | "external";

export type LlmEndpointClassification =
  | "local-internal"
  | "local-loopback"
  | "external-remote";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

const normalizeHostname = (hostname: string): string => {
  return hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
};

export const isLoopbackEndpoint = (endpoint: string): boolean => {
  try {
    const url = new URL(endpoint);
    return loopbackHosts.has(normalizeHostname(url.hostname));
  } catch {
    return false;
  }
};

export const classifyLlmEndpoint = (
  endpoint: string,
  mode: LlmServeMode
): LlmEndpointClassification => {
  if (mode === "llamacpp") {
    return "local-internal";
  }

  return isLoopbackEndpoint(endpoint) ? "local-loopback" : "external-remote";
};

export const isRemoteLlmEndpoint = (endpoint: string, mode: LlmServeMode): boolean => {
  return classifyLlmEndpoint(endpoint, mode) === "external-remote";
};
