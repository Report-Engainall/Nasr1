import { createClient } from "npm:@supabase/supabase-js@2";
import { createProductImageUploadHandler } from "../_shared/product-image-upload-handler.ts";

type Runtime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
const runtime = (globalThis as unknown as { Deno?: Runtime }).Deno;
if (!runtime) throw new Error("Supabase Edge Runtime required.");

runtime.serve(createProductImageUploadHandler({
  getEnv: (name) => runtime.env.get(name),
  createAuthClient: (url, anonKey) => {
    const auth = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return { auth: { getUser: (token) => auth.auth.getUser(token) } };
  },
  createAdminClient: (url, serviceKey) => {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return {
      getProfileByAuthUserId: async (authUserId) => {
        const { data, error } = await admin.from("profiles")
          .select("id,organization_id,is_active")
          .eq("auth_user_id", authUserId)
          .maybeSingle();
        return { data, error };
      },
      getRoles: async (profileId) => {
        const { data, error } = await admin.from("user_roles").select("role").eq("profile_id", profileId);
        return { data, error };
      },
      productExists: async (productId, organizationId) => {
        const { data, error } = await admin.from("products")
          .select("id")
          .eq("id", productId)
          .eq("organization_id", organizationId)
          .maybeSingle();
        return { data, error };
      },
      storage: {
        upload: async (objectPath, bytes, options) => {
          const { error } = await admin.storage.from("product-images").upload(objectPath, bytes, options);
          return { error };
        },
        remove: async (paths) => {
          const { error } = await admin.storage.from("product-images").remove(paths);
          return { error };
        },
        getPublicUrl: (objectPath) => admin.storage.from("product-images").getPublicUrl(objectPath),
      },
    };
  },
}));
