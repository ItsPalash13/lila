import { Client } from "@heroiclabs/nakama-js";

/** Match server `session.token_expiry_sec` (e.g. 300): refresh JWT this long before exp. */
const SESSION_REFRESH_LEAD_MS = 5 * 60 * 1000;

export function createNakamaClient(): Client {
  const serverKey = import.meta.env.VITE_NAKAMA_SERVER_KEY ?? "defaultkey";
  const host = import.meta.env.VITE_NAKAMA_HOST ?? "127.0.0.1";
  const port = import.meta.env.VITE_NAKAMA_PORT ?? "7350";
  const useSSL = import.meta.env.VITE_NAKAMA_USE_SSL === "true";
  const client = new Client(serverKey, host, port, useSSL);
  client.expiredTimespanMs = SESSION_REFRESH_LEAD_MS;
  return client;
}
