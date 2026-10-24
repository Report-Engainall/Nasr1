import { createClient } from "npm:@supabase/supabase-js@2";
import { createAsyncExportDownloadHandler } from "../_shared/async-export-download-handler.ts";

type Runtime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const runtime = (globalThis as unknown as { Deno?: Runtime }).Deno;
if (!runtime) throw new Error("async export download requires Supabase Edge Runtime.");

if (runtime) {
  const handler = createAsyncExportDownloadHandler({
    getEnv: (name) => runtime.env.get(name),
    createUserClient: (url, anonKey, token) => {
      const user = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: "Bearer " + token } },
      });
      return {
        auth: { getUser: (accessToken) => user.auth.getUser(accessToken) },
        getMyAsyncExportDownload: async (jobId) => {
          const { data, error } = await user.rpc("get_my_async_export_download", { p_job_id: jobId });
          return { data, error };
        },
      };
    },
    createAdminClient: (url, serviceKey) => {
      const admin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      return {
        createSignedUrl: async (artifactPath, expiresInSeconds, fileName) => {
          const { data, error } = await admin.storage
            .from("async-export-artifacts")
            .createSignedUrl(artifactPath, expiresInSeconds, { download: fileName });
          return { data, error };
        },
      };
    },
  });
  runtime.serve(handler);
}
