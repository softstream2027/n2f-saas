export function resolveApiBase(
  envValue = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  hostnameOverride?: string,
  protocolOverride?: string,
) {
  const value = (envValue ?? "").replace(/\/$/, "");

  if (typeof window !== "undefined") {
    hostnameOverride = window.location.hostname;
    protocolOverride = window.location.protocol;
  }

  const host = hostnameOverride ?? "localhost";
  const protocol = protocolOverride ?? "http:";
  const currentOrigin = `${protocol}//${host}${host.includes(":") && !host.startsWith("[") ? "" : ""}`;

  if (host && host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "[::1]" && value.includes("localhost")) {
    return `${protocol}//${host}`;
  }

  return value || currentOrigin;
}

export async function readJsonResponse<T = any>(response: Response): Promise<T> {
  const raw = await response.text();
  if (!raw) {
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    return {} as T;
  }

  try {
    const parsed = JSON.parse(raw) as T;
    if (!response.ok) {
      const messageObj = parsed as { message?: string | string[] };
      const message = Array.isArray(messageObj.message)
        ? messageObj.message.join(" ")
        : typeof messageObj.message === "string"
          ? messageObj.message
          : undefined;
      throw new Error(message ?? `Request failed (${response.status})`);
    }
    return parsed;
  } catch (error) {
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}): ${raw.slice(0, 180)}`);
    }

    throw new Error(
      `The server responded with a non-JSON payload. Check the backend route and the API URL. Response: ${raw.slice(0, 180)}`,
    );
  }
}
