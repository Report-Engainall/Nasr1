import { createClient } from "npm:@supabase/supabase-js@2";
import { readBoundedTextBody } from "../_shared/bounded-body.ts";
import {
  OfficialJsonErpReadConnector,
  type ErpConnection,
  type ErpReadContract,
} from "../_shared/erp-connectors/readonly-sync.ts";
import { SupabaseErpSyncCheckpointStore } from "../_shared/erp-connectors/supabase-checkpoint-store.ts";
import { createErpReadSyncHandler } from "./handler.ts";

type Runtime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const runtime = (globalThis as unknown as { Deno?: Runtime }).Deno;
if (!runtime) throw new Error("This function must run inside the Supabase Edge Runtime.");

function getEnv(name: string): string | undefined {
  return runtime.env.get(name);
}

function createAuthClient(url: string, publishableKey: string) {
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    getUser: async (token: string) => {
      const { data, error } = await client.auth.getUser(token);
      return { data: { user: data.user ? { id: data.user.id } : null }, error };
    },
  };
}

function createAdminClient(url: string, serviceRoleKey: string) {
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    getProfileByAuthUserId: async (authUserId: string) => {
      const { data, error } = await admin.from("profiles")
        .select("id,organization_id,is_active")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      return { data, error };
    },
    getRoles: async (profileId: string) => {
      const { data, error } = await admin.from("user_roles")
        .select("role")
        .eq("profile_id", profileId);
      return { data, error };
    },
  };
}

runtime.serve(createErpReadSyncHandler({
  getEnv,
  readBody: (request) => readBoundedTextBody(
    request.body,
    8192,
    request.headers.get("content-length"),
  ),
  createAuthClient,
  createAdminClient,
  createCheckpointStore: (options) => new SupabaseErpSyncCheckpointStore(options),
  createConnector: (connection: ErpConnection, contract: ErpReadContract) =>
    new OfficialJsonErpReadConnector(connection, contract),
  logError: (message, context) => console.error(message, context),
}));
