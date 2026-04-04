import type { Client, Session } from "@heroiclabs/nakama-js";
import { nakamaErrorMessage } from "./errors";

export type CreateTicRoomPayload = {
  timed?: boolean;
  turnSeconds?: number;
};

export type CreateTicRoomResult =
  | { match_id: string }
  | { error: string };

export async function rpcCreateTicRoom(
  client: Client,
  session: Session,
  body: CreateTicRoomPayload = {},
): Promise<CreateTicRoomResult> {
  try {
    const res = await client.rpc(session, "create_tic_room", body);
    const payload = res.payload;
    if (!payload || typeof payload !== "object") {
      return { error: "Empty RPC response" };
    }
    const o = payload as Record<string, unknown>;
    if (typeof o.error === "string") {
      return { error: o.error };
    }
    if (typeof o.match_id === "string") {
      return { match_id: o.match_id };
    }
    return { error: "Invalid create_tic_room response" };
  } catch (e) {
    return { error: await nakamaErrorMessage(e) };
  }
}
