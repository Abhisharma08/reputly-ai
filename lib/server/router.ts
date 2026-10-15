import QRCode from "qrcode";
import { z, ZodError } from "zod";
import {
  ApiError,
  appOrigin,
  sameOrigin,
  jsonBody,
  safeIdempotency,
  safeReturnPath,
  dbError,
  requiredEnv,
} from "./config";
import {
  authenticated,
  authorized,
  sessionClient,
  serviceClient,
} from "./supabase";
import * as workspace from "./workspace";
import {
  signupSchema,
  loginSchema,
  publicEventSchema,
  uuid,
} from "@/lib/contracts";
import {
  publicCode,
  issueSession,
  recordPublic,
  googleDestination,
  throttle,
} from "./public";
import { rewrite } from "./ai";
import { aiAvailable } from "./ai-provider";
import { AIProviderError } from "./ai-error";
import { googleBusinessProfile } from "./google-profile";
import { resolveReviewUrl } from "./review-url";
import {
  createCheckout,
  cancelSubscription,
  processWebhook,
  verifyWebhook,
  reconcileSubscription,
  cashfreeRequest,
} from "./cashfree";
import { sha256, constantTimeEqual } from "./crypto";
import { adminOverview, platformAdmin } from "./admin";
const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
export async function route(request: Request) {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/v1\//, "").split("/");
  const method = request.method;
  const [first, second, third, fourth, fifth] = path;
  const headers = { ...responseHeaders, "X-Request-ID": requestId };
  const reply = (data: unknown, status = 200) =>
    Response.json(
      { data, meta: { request_id: requestId } },
      { status, headers },
    );
  try {
    if (first === "billing" && second === "return")
      return Response.redirect(`${appOrigin()}/app/billing?returned=1`, 303);
    if (first === "webhooks" && second === "cashfree" && method === "POST") {
      const raw = await boundedText(request, 64000);
      if (
        !(await verifyWebhook(
          raw,
          request.headers.get("x-webhook-signature"),
          request.headers.get("x-webhook-timestamp"),
          requiredEnv("CASHFREE_WEBHOOK_SECRET"),
        ))
      )
        throw new ApiError(
          "WEBHOOK_SIGNATURE_INVALID",
          401,
          "Invalid webhook signature.",
        );
      return reply(await processWebhook(raw));
    }
    if (first === "jobs" && second === "maintenance" && path.length === 2 && method === "POST") {
      if (
        !constantTimeEqual(
          request.headers.get("authorization") || "",
          `Bearer ${requiredEnv("CRON_SECRET")}`,
        )
      )
        throw new ApiError("AUTH_REQUIRED", 401, "Job authorization required.");
      const db = serviceClient();
      const { data: pending, error } = await db
        .from("checkout_requests")
        .select("provider_subscription_id,created_at")
        .in("status", ["pending", "ready", "active"])
        .order("last_reconciled_at", { ascending: true, nullsFirst: true })
        .limit(20);
      dbError(error);
      let reconciled = 0,
        failed = 0;
      for (const row of pending || [])
        try {
          await reconcileSubscription(row.provider_subscription_id);
          reconciled++;
        } catch (e) {
          if (
            e instanceof ApiError &&
            e.code === "PAYMENT_NOT_FOUND" &&
            Date.parse(row.created_at) < Date.now() - 24 * 3600_000
          ) {
            const { error } = await db
              .from("checkout_requests")
              .update({
                status: "cancelled",
                last_reconciled_at: new Date().toISOString(),
              })
              .eq("provider_subscription_id", row.provider_subscription_id)
              .eq("status", "pending");
            if (error) failed++;
          } else {
            failed++;
            await db
              .from("checkout_requests")
              .update({ last_reconciled_at: new Date().toISOString() })
              .eq("provider_subscription_id", row.provider_subscription_id);
          }
        }
      const { data: deleting, error: deletionError } = await db
        .from("organizations")
        .select("id")
        .eq("status", "deleting")
        .lte("deletion_due_at", new Date().toISOString())
        .limit(50);
      dbError(deletionError);
      for (const org of deleting || []) {
        const { data: checkouts } = await db
          .from("checkout_requests")
          .select("provider_subscription_id")
          .eq("organization_id", org.id)
          .in("status", ["pending", "ready", "active"]);
        let cancelled = true;
        for (const checkout of checkouts || [])
          try {
            await cashfreeRequest(
              `/subscriptions/${encodeURIComponent(checkout.provider_subscription_id)}/manage`,
              "POST",
              {
                subscription_id: checkout.provider_subscription_id,
                action: "CANCEL",
              },
            );
            await reconcileSubscription(checkout.provider_subscription_id);
          } catch (e) {
            if (e instanceof ApiError && e.code === "PAYMENT_NOT_FOUND") {
              await db
                .from("checkout_requests")
                .update({ status: "cancelled" })
                .eq(
                  "provider_subscription_id",
                  checkout.provider_subscription_id,
                )
                .eq("status", "pending");
            } else cancelled = false;
          }
        if (cancelled) {
          const { error } = await db.rpc("remove_due_org_data");
          if (error) failed++;
        }
      }
      const { data, error: cleanupError } = await db.rpc("maintenance_cleanup");
      dbError(cleanupError);
      await db
        .from("technical_errors")
        .delete()
        .lt("created_at", new Date(Date.now() - 90 * 86400_000).toISOString());
      const { data: accounts, error: accountsError } = await db
        .from("account_deletion_requests")
        .select("user_id")
        .lte("due_at", new Date().toISOString())
        .limit(50);
      dbError(accountsError);
      for (const account of accounts || []) {
        const { data: owned, error: ownedError } = await db
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", account.user_id)
          .eq("role", "organization_admin");
        dbError(ownedError);
        if (owned?.length) {
          failed++;
          continue;
        }
        const { error: deleteError } = await db.auth.admin.deleteUser(
          account.user_id,
        );
        if (deleteError) failed++;
      }
      return reply({ reconciled, failed, cleanup: data }, failed ? 207 : 200);
    }
    sameOrigin(request);
    if (first === "auth") {
      const db = await sessionClient();
      if (second === "me" && method === "GET")
        return reply(await workspace.memberships());
      if (second === "google" && method === "GET") {
        const next = safeReturnPath(url.searchParams.get("next"));
        const { data, error } = await db.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${appOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
            skipBrowserRedirect: true,
          },
        });
        if (error || !data.url)
          throw new ApiError(
            "AUTH_PROVIDER_UNAVAILABLE",
            503,
            "Google sign-in is unavailable.",
          );
        return Response.redirect(data.url, 303);
      }
      if (second === "signup" && method === "POST") {
        await throttle(request, "signup", 5, 600);
        const b = signupSchema.parse(await jsonBody(request));
        const { error } = await db.auth.signUp({
          email: b.email,
          password: b.password,
          options: {
            data: {
              display_name: b.name,
              terms_accepted_at: new Date().toISOString(),
            },
            emailRedirectTo: `${appOrigin()}/auth/callback`,
          },
        });
        if (error)
          throw new ApiError(
            "SIGNUP_FAILED",
            422,
            "Account creation could not be completed. Check your details or try signing in.",
          );
        return reply(
          {
            message:
              "Check your email to verify your account before signing in.",
          },
          201,
        );
      }
      if (second === "login" && method === "POST") {
        await throttle(request, "login", 10, 300);
        const b = loginSchema.parse(await jsonBody(request));
        const { error } = await db.auth.signInWithPassword(b);
        if (error)
          throw new ApiError(
            "LOGIN_FAILED",
            401,
            "Check your email and password. Verify your email before signing in.",
          );
        return reply({ next: "/app" });
      }
      if (second === "logout" && method === "POST") {
        const { error } = await db.auth.signOut();
        if (error)
          throw new ApiError(
            "AUTH_UNAVAILABLE",
            503,
            "Sign-out could not be completed.",
          );
        return reply({ next: "/login" });
      }
      if (second === "reset" && method === "POST") {
        await throttle(request, "reset", 5, 600);
        const b = z
          .object({ email: z.string().email() })
          .strict()
          .parse(await jsonBody(request));
        await db.auth.resetPasswordForEmail(b.email, {
          redirectTo: `${appOrigin()}/auth/callback?next=/reset-password`,
        });
        return reply({
          message:
            "If this account exists, a password-reset link has been sent.",
        });
      }
      if (second === "delete-account" && method === "POST") {
        const b = z
          .object({ confirmation: z.literal("DELETE ACCOUNT") })
          .strict()
          .parse(await jsonBody(request));
        void b;
        const { db } = await authenticated();
        const { error } = await db.rpc("request_account_deletion");
        dbError(error);
        await db.auth.signOut();
        return reply({ status: "deletion_scheduled", delay_days: 30 });
      }
      if (second === "password" && method === "POST") {
        await authenticated();
        const b = z
          .object({ password: z.string().min(12).max(128) })
          .strict()
          .parse(await jsonBody(request));
        const { error } = await db.auth.updateUser(b);
        if (error)
          throw new ApiError(
            "PASSWORD_UPDATE_FAILED",
            422,
            "Password could not be updated. Request a fresh reset link.",
          );
        return reply({
          message: "Password updated. You can now open your workspace.",
        });
      }
      if (second === "mfa") {
        const { db: auth, user } = await authenticated();
        if (method === "POST") await throttle(request, `mfa:${user.id}`, 5, 300);
        if (third === "list" && method === "GET") {
          const { data, error } = await auth.auth.mfa.listFactors();
          if (error)
            throw new ApiError(
              "MFA_UNAVAILABLE",
              503,
              "Authenticator settings are unavailable.",
            );
          return reply({ factors: data.totp });
        }
        if (third === "enroll" && method === "POST") {
          const { data, error } = await auth.auth.mfa.enroll({
            factorType: "totp",
            friendlyName: "Reputly authenticator",
          });
          if (error)
            throw new ApiError(
              "MFA_UNAVAILABLE",
              422,
              "Could not enroll an authenticator. Remove unfinished factors in Supabase and try again.",
            );
          return reply({
            id: data.id,
            uri: data.totp.uri,
            secret: data.totp.secret,
          });
        }
        if (third === "verify" && method === "POST") {
          const b = z
            .object({ factor_id: uuid, code: z.string().regex(/^\d{6}$/) })
            .strict()
            .parse(await jsonBody(request));
          const { error } = await auth.auth.mfa.challengeAndVerify({
            factorId: b.factor_id,
            code: b.code,
          });
          if (error)
            throw new ApiError(
              "MFA_INVALID",
              422,
              "The code is invalid or expired. Try the next code.",
            );
          return reply({ verified: true });
        }
      }
    }
    if (first === "plans" && method === "GET") {
      const currency = z
        .enum(["INR", "USD"])
        .parse(url.searchParams.get("currency") || "INR");
      const { data, error } = await serviceClient()
        .from("plans")
        .select(
          "id,code,name,currency,amount_minor,location_limit,ai_monthly_limit,billing_period",
        )
        .eq("currency", currency)
        .eq("is_active", true)
        .order("amount_minor");
      dbError(error);
      return reply(data);
    }
    if (first === "public") {
      if (second === "qr" && third) {
        if (["session", "sessions"].includes(fourth) && method === "POST") {
          await throttle(request, "public-session", 30);
          const { session_id, ...s } = await issueSession(third);
          void session_id;
          return reply(s, 201);
        }
        if (fourth === "review-link" && method === "GET") {
          const d = await googleDestination(third);
          return url.searchParams.get("redirect") === "1"
            ? Response.redirect(d.url, 303)
            : reply(d);
        }
        if (!fourth && method === "GET") {
          const { q, l } = await publicCode(third);
          return reply({
            slug: q.slug,
            label: q.label,
            brand_color: q.brand_color || l.brand_color,
            location: { name: l.name, category: l.category, locale: l.locale },
            business_name: l.name,
            locale: l.locale,
            category: l.category,
            available_languages: ["en", "hi"],
            google_handoff_available: true,
            ai_enabled: aiAvailable(),
          });
        }
      }
      if (second === "events" && method === "POST") {
        await throttle(request, "public-events", 60);
        const b = publicEventSchema.parse(await jsonBody(request));
        return reply(
          await recordPublic(b.session_token, b.event_type, b.event_id),
          202,
        );
      }
      if (second === "assist" && third === "rewrite" && method === "POST") {
        await throttle(request, "public-ai", 10);
        return reply(await rewrite(await jsonBody(request)));
      }
    }
    if (first === "invitations" && second === "accept" && method === "POST") {
      const b = z
        .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
        .strict()
        .parse(await jsonBody(request));
      const { db } = await authenticated();
      const { data, error } = await db.rpc("accept_invitation", {
        p_hash: await sha256(b.token),
      });
      dbError(error);
      return reply({ organization_id: data });
    }
    if (first === "orgs") {
      if (!second && method === "GET")
        return reply(await workspace.memberships());
      if (!second && method === "POST")
        return reply(
          await workspace.createOrg(
            await jsonBody(request),
            safeIdempotency(request),
          ),
          201,
        );
      const org = uuid.parse(second);
      if (!third) {
        if (method === "GET") return reply(await workspace.snapshot(org));
        if (method === "PATCH")
          return reply(await workspace.updateOrg(org, await jsonBody(request)));
      }
      if (third === "locations") {
        if (!fourth && method === "GET")
          return reply(
            await workspace.listResource(org, "locations", url.searchParams),
          );
        if (!fourth && method === "POST")
          return reply(
            await workspace.saveLocation(
              org,
              null,
              await jsonBody(request),
              safeIdempotency(request),
            ),
            201,
          );
        if (fourth && method === "PATCH")
          return reply(
            await workspace.saveLocation(
              org,
              uuid.parse(fourth),
              await jsonBody(request),
              null,
            ),
          );
        if (fourth && method === "DELETE")
          return reply(
            await workspace.saveLocation(
              org,
              uuid.parse(fourth),
              { status: "archived" },
              null,
            ),
          );
      }
      if (third === "review-url" && method === "POST") {
        await authorized(org);
        await throttle(request, `google-profile:${org}`, 10);
        const b = z
          .object({ url: z.string().max(2048) })
          .strict()
          .parse(await jsonBody(request));
        const destination = await resolveReviewUrl(b.url);
        let profile = null, profileStatus = "not_configured";
        try {
          profile = await googleBusinessProfile(destination);
          if (profile) profileStatus = "loaded";
        } catch { profileStatus = "unavailable"; }
        return reply({
          url: destination,
          profile,
          profile_status: profileStatus,
          ownership_verified: false,
        });
      }
      if (["qr", "qr-codes"].includes(third)) {
        if (!fourth && method === "GET")
          return reply(
            await workspace.listResource(org, "qr_codes", url.searchParams),
          );
        if (fourth && fifth === "asset" && method === "GET") {
          const { db } = await authorized(org);
          const { data: q, error } = await db
            .from("qr_codes")
            .select("slug,label")
            .eq("id", uuid.parse(fourth))
            .eq("organization_id", org)
            .maybeSingle();
          dbError(error);
          if (!q) throw new ApiError("NOT_FOUND", 404, "The QR was not found.");
          const format = z
            .enum(["svg", "png"])
            .parse(url.searchParams.get("format") || "svg");
          const value = `${appOrigin()}/r/${q.slug}`;
          if (format === "svg")
            return new Response(
              await QRCode.toString(value, {
                type: "svg",
                width: 1024,
                margin: 4,
                errorCorrectionLevel: "M",
              }),
              {
                headers: {
                  ...headers,
                  "Content-Type": "image/svg+xml",
                  "Content-Disposition":
                    'attachment; filename="reputly-qr.svg"',
                },
              },
            );
          return new Response(
            new Uint8Array(
              await QRCode.toBuffer(value, {
                type: "png",
                width: 1024,
                margin: 4,
                errorCorrectionLevel: "M",
              }),
            ),
            {
              headers: {
                ...headers,
                "Content-Type": "image/png",
                "Content-Disposition": 'attachment; filename="reputly-qr.png"',
              },
            },
          );
        }
        if (!fourth && method === "POST")
          return reply(
            await workspace.saveQR(
              org,
              null,
              await jsonBody(request),
              safeIdempotency(request),
            ),
            201,
          );
        if (fourth && method === "PATCH")
          return reply(
            await workspace.saveQR(
              org,
              uuid.parse(fourth),
              await jsonBody(request),
              null,
            ),
          );
        if (fourth && method === "DELETE")
          return reply(
            await workspace.saveQR(
              org,
              uuid.parse(fourth),
              { is_active: false },
              null,
            ),
          );
      }
      if (third === "analytics" && method === "GET")
        return reply(await workspace.analytics(org, url.searchParams));
      if (third === "export" && method === "GET")
        return Response.json(await workspace.exportOrg(org), {
          headers: {
            ...responseHeaders,
            "Content-Disposition":
              'attachment; filename="reputly-workspace-export.json"',
          },
        });
      if (third === "billing") {
        if (!fourth && method === "GET")
          return reply(await workspace.billing(org));
        if (fourth === "checkout" && method === "POST")
          return reply(
            await createCheckout(
              org,
              await jsonBody(request),
              safeIdempotency(request),
            ),
            201,
          );
        if (fourth === "cancel" && method === "POST")
          return reply(await cancelSubscription(org));
        if (fourth === "refresh" && method === "POST") {
          await authorized(org, true);
          const { data, error } = await serviceClient()
            .from("checkout_requests")
            .select("provider_subscription_id")
            .eq("organization_id", org)
            .in("status", ["ready", "active"])
            .limit(10);
          dbError(error);
          for (const c of data || [])
            await reconcileSubscription(c.provider_subscription_id);
          return reply(await workspace.billing(org));
        }
      }
      if (third === "team") {
        if (!fourth && method === "GET")
          return reply(await workspace.team(org));
        if (fourth === "invite" && method === "POST") {
          await authorized(org, true);
          await throttle(request, `invite:${org}`, 20, 600);
          return reply(
            await workspace.invite(org, await jsonBody(request)),
            201,
          );
        }
        if (fourth && method === "DELETE") {
          const { db } = await authorized(org, true);
          const { error } = await db.rpc("remove_member", {
            p_org: org,
            p_user: uuid.parse(fourth),
          });
          dbError(error);
          return reply({ removed: true });
        }
      }
    }
    if (first === "admin") {
      if (second === "overview" && method === "GET")
        return reply(await adminOverview());
      if (second === "orgs" && third && method === "PATCH") {
        const { admin, user } = await platformAdmin();
        const b = z
          .object({
            status: z.enum(["active", "suspended"]),
            reason: z.string().trim().min(5).max(300),
          })
          .strict()
          .parse(await jsonBody(request));
        const { error } = await admin.rpc("admin_set_org_status", {
          p_actor: user.id,
          p_org: uuid.parse(third),
          p_status: b.status,
          p_reason: b.reason,
        });
        dbError(error);
        return reply({ updated: true });
      }
    }
    throw new ApiError("NOT_FOUND", 404, "This endpoint was not found.");
  } catch (error) {
    const e =
      error instanceof ApiError
        ? error
        : error instanceof ZodError
          ? new ApiError(
              "VALIDATION_FAILED",
              422,
              "Check the supplied fields.",
              Object.fromEntries(
                error.issues.map((i) => [i.path.join("."), i.message]),
              ),
            )
          : new ApiError(
              "INTERNAL_ERROR",
              503,
              "The request could not be completed. Please try again.",
            );
    if (e.status >= 500) {
      try {
        await serviceClient()
          .from("technical_errors")
          .insert({ request_id: requestId, route: first, error_code: e.code });
      } catch {}
      console.error(
        JSON.stringify({
          request_id: requestId,
          code: e.code,
          route: first,
          ...(e instanceof AIProviderError
            ? {
                ai_provider: e.provider,
                ai_reason: e.reason,
                ai_stage: e.stage,
                provider_http_status: e.httpStatus,
                network_code: e.networkCode,
                network_detail: e.networkDetail,
                provider_rejection: e.rejection,
                rejected_field: e.rejectedField,
              }
            : {}),
        }),
      );
    }
    return Response.json(
      {
        error: { code: e.code, message: e.message, fields: e.fields },
        meta: { request_id: requestId },
      },
      {
        status: e.status,
        headers: {
          ...headers,
          ...(e.status === 429 ? { "Retry-After": "60" } : {}),
        },
      },
    );
  }
}
export async function boundedText(request: Request, max: number) {
  if (Number(request.headers.get("content-length") || 0) > max)
    throw new ApiError("PAYLOAD_TOO_LARGE", 413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  let text = "";
  let total = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new ApiError("PAYLOAD_TOO_LARGE", 413, "Request is too large.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
