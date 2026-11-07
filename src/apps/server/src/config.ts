import { z } from "zod";

const envSchema = z.object({
  DATABASE_PATH: z.string().min(1),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  // The Docker image has the migrations in /app/migrations, the working directory.
  MIGRATIONS_FOLDER: z.string().min(1).default("migrations"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  // Proxies in front of the server. Caddy on the host is one.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});

export type ServerEnv = z.infer<typeof envSchema>;

export const parseServerEnv = (env: Record<string, string | undefined>) =>
  envSchema.parse(env);
