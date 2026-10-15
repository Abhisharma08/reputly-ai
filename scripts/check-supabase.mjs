import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";

// Read-only diagnostics. Never print keys, provider response bodies or user data.
const selectedFile = process.argv[2];
const envFile = selectedFile ?? [".dev.vars", ".env.local"].find(existsSync);
const config = {
  ...(envFile ? parseEnv(readFileSync(envFile, "utf8")) : {}),
  ...process.env,
};

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function main() {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SESSION_HASH_SECRET",
    "CRON_SECRET",
  ];
  const missing = required.filter((name) => !config[name]?.trim());
  if (missing.length) {
    fail(`Missing configuration: ${missing.join(", ")}.`);
    return;
  }
  let origin;
  try {
    const url = new URL(config.SUPABASE_URL);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    origin = url.origin;
  } catch {
    fail("SUPABASE_URL must be your HTTPS project URL.");
    return;
  }
  const timedFetch = (url, options) =>
    fetch(url, {
      ...options,
      signal: AbortSignal.timeout(15_000),
    });
  console.log(
    `Checking local configuration${envFile ? ` from ${envFile}` : ""}.`,
  );
  const response = await timedFetch(`${origin}/auth/v1/settings`, {
    headers: { apikey: config.SUPABASE_PUBLISHABLE_KEY },
    redirect: "error",
  });
  if (!response.ok) {
    fail(
      `Publishable key/auth check failed (HTTP ${response.status}). Check that the URL and key belong to the same project.`,
    );
    return;
  }
  const settings = await response.json();
  console.log("PASS: project reachable and publishable key accepted.");
  console.log(
    `Email sign-in: ${settings.external?.email ? "enabled" : "disabled"}; confirmation: ${settings.mailer_autoconfirm === false ? "required" : "not required"}; Google sign-in: ${settings.external?.google ? "enabled" : "disabled"}.`,
  );
  const client = createClient(origin, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timedFetch },
  });
  const checks = [
    ["qr_codes", "channel"],
    ["plans", "id"],
    ["rate_limits", "key_hash"],
    ["organizations", "id"],
    ["locations", "id"],
    ["qr_codes", "id"],
    ["payment_records", "id"],
    ["checkout_requests", "last_reconciled_at"],
    ["account_deletion_requests", "user_id"],
    ["technical_errors", "request_id"],
  ];
  for (const [table, column] of checks) {
    const { error, status } = await client
      .from(table)
      .select(column, { head: true })
      .limit(0);
    if (error) {
      fail(`FAIL: ${table} (HTTP ${status}).`);
      if (status === 0) {
        fail(
          "Database request could not reach Supabase. Check your network and project availability.",
        );
        return;
      }
      if ([401, 403].includes(status)) {
        fail("Check the server secret/service-role key and database grants.");
        return;
      }
      fail(
        "Check that all SQL migrations in supabase/migrations/ were applied in order.",
      );
    } else {
      console.log(`PASS: ${table}.${column}.`);
    }
  }
  if (process.exitCode) return;
  const { data, error } = await client
    .from("plans")
    .select("code")
    .eq("is_active", true);
  const codes = new Set(data?.map((plan) => plan.code));
  const expected = ["starter", "growth", "business"].flatMap((plan) => [
    `${plan}-inr`,
    `${plan}-usd`,
  ]);
  if (error || !expected.every((code) => codes.has(code))) {
    fail(
      "The expected six active pricing plans are missing. Check the core migration.",
    );
    return;
  }
  console.log(
    "PASS: server database access and required schema markers; six pricing plans present.",
  );
  console.log(
    "No accounts, business records, subscriptions or emails were created. Sign-in and OAuth still require an interactive check.",
  );
}

main().catch((error) => {
  const code = error?.cause?.code;
  fail(
    code === "ENOTFOUND" || code === "EAI_AGAIN"
      ? "Cannot resolve the Supabase hostname. Check your network, project URL, or restricted execution environment."
      : "Supabase check could not complete. Check connectivity, configuration and project availability.",
  );
});
