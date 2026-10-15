import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const ids = {
  ownerA: "10000000-0000-4000-8000-000000000001",
  ownerB: "10000000-0000-4000-8000-000000000002",
  manager: "10000000-0000-4000-8000-000000000003",
  stranger: "10000000-0000-4000-8000-000000000004",
};
let pg: PGlite;
let orgA: string, orgB: string, locA: string, locA2: string, locB: string;
async function asUser<T>(id: string, sql: string, params: unknown[] = []) {
  await pg.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
  try {
    return (await pg.query<T>(sql, params)).rows;
  } finally {
    await pg.exec("reset role");
  }
}
before(async () => {
  pg = new PGlite();
  await pg.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`,
  );
  for (const file of (await readdir("supabase/migrations")).sort())
    await pg.exec(await readFile("supabase/migrations/" + file, "utf8"));
  for (const [id, name] of Object.entries(ids))
    await pg.query("insert into auth.users values($1,$2,now(),'{}')", [
      name,
      id + "@example.test",
    ]);
  orgA = (
    await asUser<{ id: string }>(
      ids.ownerA,
      "select public.create_organization('A Cafe','IN','en','create-org-a-123456') id",
    )
  )[0].id;
  orgB = (
    await asUser<{ id: string }>(
      ids.ownerB,
      "select public.create_organization('B Cafe','IN','en','create-org-b-123456') id",
    )
  )[0].id;
  const location = {
    name: "Test Cafe",
    category: "cafe",
    country_code: "IN",
    locale: "en",
    timezone: "Asia/Kolkata",
    status: "draft",
    address: "",
    brand_color: "#315b43",
    google_review_url: "",
    destination_confirmed: false,
  };
  locA = (
    await asUser<{ id: string }>(
      ids.ownerA,
      "select public.upsert_location($1,null,$2,$3) id",
      [orgA, location, "location-a-123456"],
    )
  )[0].id;
  locA2 = (
    await asUser<{ id: string }>(
      ids.ownerA,
      "select public.upsert_location($1,null,$2,$3) id",
      [orgA, location, "location-a2-123456"],
    )
  )[0].id;
  locB = (
    await asUser<{ id: string }>(
      ids.ownerB,
      "select public.upsert_location($1,null,$2,$3) id",
      [orgB, location, "location-b-123456"],
    )
  )[0].id;
  await pg.query(
    "insert into public.organization_members(organization_id,user_id,role,accepted_at) values($1,$2,'location_manager',now())",
    [orgA, ids.manager],
  );
  await pg.query("insert into public.location_assignments values($1,$2,$3)", [
    orgA,
    locA,
    ids.manager,
  ]);
});
after(async () => {
  await pg?.close();
});
describe("Actual PostgreSQL RLS and atomic RPCs", () => {
  it("creates owner membership and trial atomically", async () => {
    const members = await asUser(
      ids.ownerA,
      "select * from public.organization_members where organization_id=$1",
      [orgA],
    );
    assert.equal(members.length, 2);
    const subs = await asUser<{ status: string }>(
      ids.ownerA,
      "select * from public.subscriptions where organization_id=$1",
      [orgA],
    );
    assert.equal(subs[0].status, "trialing");
  });
  it("idempotently creates one organization", async () => {
    const again = await asUser<{ id: string }>(
      ids.ownerA,
      "select public.create_organization('A Cafe','IN','en','create-org-a-123456') id",
    );
    assert.equal(again[0].id, orgA);
  });
  it("blocks cross-tenant reads for owners and managers", async () => {
    assert.equal(
      (
        await asUser(
          ids.ownerA,
          "select * from public.locations where organization_id=$1",
          [orgB],
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await asUser(
          ids.manager,
          "select * from public.organizations where id=$1",
          [orgB],
        )
      ).length,
      0,
    );
  });
  it("restricts managers to assigned locations", async () => {
    const rows = await asUser<{ id: string }>(
      ids.manager,
      "select id from public.locations where organization_id=$1",
      [orgA],
    );
    assert.deepEqual(
      rows.map((r) => r.id),
      [locA],
    );
  });
  it("denies cross-tenant mutations even through security-definer RPCs", async () => {
    await assert.rejects(
      () =>
        asUser(
          ids.ownerA,
          'select public.upsert_location($1,$2,\'{"name":"Hacked"}\',null)',
          [orgB, locB],
        ),
      /TENANT_ACCESS_DENIED/,
    );
  });
  it("denies direct inserts, updates and deletes", async () => {
    for (const sql of [
      "update public.locations set name='Hacked' where id=$1",
      "delete from public.locations where id=$1",
      "insert into public.organization_members(organization_id,user_id,role) values($1,$2,'organization_admin')",
    ]) {
      await assert.rejects(
        () =>
          asUser(
            ids.stranger,
            sql,
            sql.includes("organization_members")
              ? [orgA, ids.stranger]
              : [locA],
          ),
        /permission denied/,
      );
    }
  });
  it("hides billing from managers and denies org delete", async () => {
    assert.equal(
      (
        await asUser(
          ids.manager,
          "select * from public.subscriptions where organization_id=$1",
          [orgA],
        )
      ).length,
      0,
    );
    await assert.rejects(
      () =>
        asUser(ids.manager, "select public.update_organization($1,null,true)", [
          orgA,
        ]),
      /ROLE_REQUIRED/,
    );
  });
  it("cannot activate a location without a valid confirmed destination", async () => {
    await assert.rejects(
      () =>
        asUser(
          ids.ownerA,
          'select public.upsert_location($1,$2,\'{"status":"active"}\',null)',
          [orgA, locA],
        ),
      /check constraint/,
    );
  });
  it("enforces location limits in the database", async () => {
    const value = {
      name: "Third Cafe",
      category: "cafe",
      country_code: "IN",
      locale: "en",
      timezone: "Asia/Kolkata",
      status: "draft",
    };
    await asUser(ids.ownerA, "select public.upsert_location($1,null,$2,$3)", [
      orgA,
      value,
      "third-location-12345",
    ]);
    await assert.rejects(
      () =>
        asUser(ids.ownerA, "select public.upsert_location($1,null,$2,$3)", [
          orgA,
          value,
          "fourth-location-12345",
        ]),
      /LOCATION_LIMIT/,
    );
  });
  it("revokes a removed manager on the next query", async () => {
    await asUser(ids.ownerA, "select public.remove_member($1,$2)", [
      orgA,
      ids.manager,
    ]);
    assert.equal(
      (
        await asUser(
          ids.manager,
          "select * from public.locations where organization_id=$1",
          [orgA],
        )
      ).length,
      0,
    );
  });
  it("does not expose service-only functions to authenticated callers", async () => {
    await assert.rejects(
      () =>
        asUser(ids.ownerA, "select public.consume_rate_limit('abuse',60,10)"),
      /permission denied/,
    );
  });
  it("has no customer narrative columns in any public table", async () => {
    const rows = await pg.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema='public'",
    );
    assert.ok(
      !rows.rows.some((r) =>
        /source_text|draft|narrative|raw_payload|card_number|cvv/.test(
          r.column_name,
        ),
      ),
    );
  });
});
let billingOrg: string,
  checkout: string,
  planId: string,
  qrId: string,
  sessionId: string;
async function asService<T>(sql: string, params: unknown[] = []) {
  await pg.exec("set role service_role");
  try {
    return (await pg.query<T>(sql, params)).rows;
  } finally {
    await pg.exec("reset role");
  }
}
async function bill(
  event: string,
  type: string,
  status: string,
  payment: string | null,
  amount: number | null,
  when: string,
  paymentType: string | null = "CHARGE",
) {
  return asService<{ accepted: boolean }>(
    "select public.apply_billing_event($1,$2,$3,$4,$5,$6,$7,$8,$9) accepted",
    [event, type, checkout, status, payment, amount, "INR", when, paymentType],
  );
}
const paidAt = new Date().toISOString();
describe("Payment integrity and anonymous quotas in PostgreSQL", () => {
  before(async () => {
    billingOrg = (
      await asUser<{ id: string }>(
        ids.stranger,
        "select public.create_organization('Billing Cafe','IN','en','billing-org-12345678') id",
      )
    )[0].id;
    planId = (
      await pg.query<{ id: string }>(
        "select id from public.plans where code='starter-inr'",
      )
    ).rows[0].id;
    checkout = "rp_database_test";
    await asService("select public.prepare_checkout($1,$2,$3,$4)", [
      billingOrg,
      planId,
      "checkout-test-12345",
      checkout,
    ]);
    const l = (
      await asUser<{ id: string }>(
        ids.stranger,
        "select public.upsert_location($1,null,$2,$3) id",
        [
          billingOrg,
          {
            name: "Real Cafe",
            category: "Cafe",
            country_code: "IN",
            locale: "hi",
            timezone: "Asia/Kolkata",
            status: "active",
            google_review_url:
              "https://search.google.com/local/writereview?placeid=ChITest123",
            destination_confirmed: true,
          },
          "live-location-123456",
        ],
      )
    )[0].id;
    qrId = (
      await asUser<{ id: string }>(
        ids.stranger,
        "select public.upsert_qr($1,null,$2,$3,$4) id",
        [
          billingOrg,
          {
            location_id: l,
            label: "Share your experience",
            brand_color: "#315b43",
          },
          "live-qr-123456789",
          "random_unpredictable_slug_123456",
        ],
      )
    )[0].id;
    sessionId = (
      await pg.query<{ id: string }>(
        "insert into public.public_sessions(qr_code_id,token_hash) values($1,$2) returning id",
        [qrId, "hash_test_session"],
      )
    ).rows[0].id;
  });
  it("does not grant paid access for mandate authorization", async () => {
    await bill(
      "auth-1",
      "SUBSCRIPTION_PAYMENT_SUCCESS",
      "SUCCESS",
      "auth_payment",
      100,
      paidAt,
      "AUTH",
    );
    assert.equal(
      (
        await pg.query<{ status: string }>(
          "select status from public.subscriptions where organization_id=$1",
          [billingOrg],
        )
      ).rows[0].status,
      "trialing",
    );
  });
  it("rejects mismatched payment amount and preserves the trial", async () => {
    await bill(
      "wrong-amount",
      "SUBSCRIPTION_PAYMENT_SUCCESS",
      "SUCCESS",
      "wrong_amount",
      1,
      paidAt,
    );
    assert.equal(
      (
        await pg.query<{ status: string }>(
          "select status from public.subscriptions where organization_id=$1",
          [billingOrg],
        )
      ).rows[0].status,
      "trialing",
    );
  });
  it("activates only the server-selected plan after a successful charge", async () => {
    await bill(
      "paid-1",
      "SUBSCRIPTION_PAYMENT_SUCCESS",
      "SUCCESS",
      "charge_payment",
      39900,
      paidAt,
    );
    const s = (
      await pg.query<{ status: string; plan_id: string }>(
        "select status,plan_id from public.subscriptions where organization_id=$1",
        [billingOrg],
      )
    ).rows[0];
    assert.equal(s.status, "active");
    assert.equal(s.plan_id, planId);
  });
  it("deduplicates raw events and repeated payment IDs", async () => {
    assert.equal(
      (
        await bill(
          "paid-1",
          "SUBSCRIPTION_PAYMENT_SUCCESS",
          "SUCCESS",
          "charge_payment",
          39900,
          paidAt,
        )
      )[0].accepted,
      false,
    );
    await bill(
      "paid-other-envelope",
      "SUBSCRIPTION_PAYMENT_SUCCESS",
      "SUCCESS",
      "charge_payment",
      39900,
      paidAt,
    );
    assert.equal(
      (
        await pg.query<{ count: number }>(
          "select count(*)::int count from public.payment_records where organization_id=$1",
          [billingOrg],
        )
      ).rows[0].count,
      1,
    );
  });
  it("does not extend the paid period when an older payment arrives late", async () => {
    const before = (
      await pg.query<{ end: string }>(
        "select current_period_end::text as end from public.subscriptions where organization_id=$1",
        [billingOrg],
      )
    ).rows[0].end;
    await bill(
      "late-charge",
      "SUBSCRIPTION_PAYMENT_SUCCESS",
      "SUCCESS",
      "older_charge",
      39900,
      new Date(Date.now() - 60 * 86400000).toISOString(),
    );
    const after = (
      await pg.query<{ end: string }>(
        "select current_period_end::text as end from public.subscriptions where organization_id=$1",
        [billingOrg],
      )
    ).rows[0].end;
    assert.equal(before, after);
  });
  it("does not clear a renewal grace period for an old late-arriving charge", async () => {
    const prior = (
      await pg.query<{ end: string }>(
        "select current_period_end::text as end from public.subscriptions where organization_id=$1",
        [billingOrg],
      )
    ).rows[0].end;
    await pg.query(
      "update public.subscriptions set status='past_due',grace_until=now()+interval '3 days' where organization_id=$1",
      [billingOrg],
    );
    await bill(
      "late-during-grace",
      "SUBSCRIPTION_PAYMENT_SUCCESS",
      "SUCCESS",
      "old_grace_charge",
      39900,
      new Date(Date.now() - 90 * 86400000).toISOString(),
    );
    const s = (
      await pg.query<{ status: string; grace_until: string }>(
        "select status,grace_until::text from public.subscriptions where organization_id=$1",
        [billingOrg],
      )
    ).rows[0];
    assert.equal(s.status, "past_due");
    assert.ok(s.grace_until);
    await pg.query(
      "update public.subscriptions set status='active',grace_until=null,current_period_end=$2 where organization_id=$1",
      [billingOrg, prior],
    );
  });
  it("prevents overlapping active subscriptions", async () => {
    await assert.rejects(
      () =>
        asService("select public.prepare_checkout($1,$2,$3,$4)", [
          billingOrg,
          planId,
          "another-checkout-key",
          "other_ref",
        ]),
      /ACTIVE_SUBSCRIPTION/,
    );
  });
  it("records timezone-based daily aggregates exactly once per dedupe key", async () => {
    for (let i = 0; i < 2; i++)
      await asService("select public.record_public_event($1,$2,$3)", [
        sessionId,
        "qr_opened",
        "dedupe-open-1",
      ]);
    const rows = (
      await pg.query<{ day: string; event_count: number }>(
        "select day::text,event_count::int from public.analytics_daily where qr_code_id=$1 and event_type=$2",
        [qrId, "qr_opened"],
      )
    ).rows;
    assert.equal(rows[0].event_count, 1);
    assert.equal(
      rows[0].day,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    );
  });
  it("limits a customer session to three AI attempts", async () => {
    for (let i = 0; i < 3; i++) {
      const use = (
        await asService<{ id: string }>("select public.reserve_ai($1,$2) id", [
          sessionId,
          "test-model",
        ])
      )[0].id;
      await asService("select public.finish_ai($1,$2,$3,$4)", [
        use,
        "completed",
        50,
        20,
      ]);
    }
    await assert.rejects(
      () =>
        asService("select public.reserve_ai($1,$2)", [sessionId, "test-model"]),
      /AI_QUOTA_EXCEEDED/,
    );
    const count = (
      await pg.query<{ n: number }>(
        "select ai_requests n from public.usage_counters where organization_id=$1",
        [billingOrg],
      )
    ).rows[0].n;
    assert.equal(count, 3);
  });
  it("enforces the monthly cap and rolls back failed reservations atomically", async () => {
    const other = (
      await pg.query<{ id: string }>(
        "insert into public.public_sessions(qr_code_id,token_hash) values($1,$2) returning id",
        [qrId, "other_hash"],
      )
    ).rows[0].id;
    await pg.query(
      "update public.usage_counters set ai_requests=500 where organization_id=$1",
      [billingOrg],
    );
    await assert.rejects(
      () => asService("select public.reserve_ai($1,$2)", [other, "test-model"]),
      /AI_QUOTA_EXCEEDED/,
    );
    assert.equal(
      (
        await pg.query<{ n: number }>(
          "select ai_attempts n from public.public_sessions where id=$1",
          [other],
        )
      ).rows[0].n,
      0,
    );
    await pg.query(
      "update public.usage_counters set ai_requests=3 where organization_id=$1",
      [billingOrg],
    );
  });
  it("refunds organization quota for failed calls but preserves session abuse limits", async () => {
    const other = (
      await pg.query<{ id: string }>(
        "insert into public.public_sessions(qr_code_id,token_hash) values($1,$2) returning id",
        [qrId, "failure_hash"],
      )
    ).rows[0].id;
    const u = (
      await asService<{ id: string }>("select public.reserve_ai($1,$2) id", [
        other,
        "test-model",
      ])
    )[0].id;
    await asService("select public.finish_ai($1,$2,$3,$4)", [
      u,
      "failed",
      0,
      0,
    ]);
    await asService("select public.finish_ai($1,$2,$3,$4)", [
      u,
      "failed",
      0,
      0,
    ]);
    assert.equal(
      (
        await pg.query<{ n: number }>(
          "select ai_requests n from public.usage_counters where organization_id=$1",
          [billingOrg],
        )
      ).rows[0].n,
      3,
    );
    assert.equal(
      (
        await pg.query<{ n: number }>(
          "select ai_attempts n from public.public_sessions where id=$1",
          [other],
        )
      ).rows[0].n,
      1,
    );
  });
  it("keeps paid access until period end after a confirmed cancellation", async () => {
    await bill(
      "cancel",
      "SUBSCRIPTION_STATUS_CHANGED",
      "CANCELLED",
      null,
      null,
      paidAt,
      null,
    );
    const s = (
      await pg.query<{ status: string; end: Date }>(
        "select status,current_period_end as end from public.subscriptions where organization_id=$1",
        [billingOrg],
      )
    ).rows[0];
    assert.equal(s.status, "cancelled");
    assert.ok(new Date(s.end) > new Date());
  });
  it("blocks new AI requests immediately for suspended organizations", async () => {
    await asService("select public.admin_set_org_status($1,$2,$3,$4)", [
      ids.ownerA,
      billingOrg,
      "suspended",
      "Test suspension",
    ]);
    await assert.rejects(
      () =>
        asService("select public.reserve_ai($1,$2)", [sessionId, "test-model"]),
      /QR_INACTIVE/,
    );
    await asService("select public.admin_set_org_status($1,$2,$3,$4)", [
      ids.ownerA,
      billingOrg,
      "active",
      "Test reactivation",
    ]);
  });
  it("archives a location without changing its QR slug and blocks new public events", async () => {
    const q = (
      await pg.query<{ location_id: string; slug: string }>(
        "select location_id,slug from public.qr_codes where id=$1",
        [qrId],
      )
    ).rows[0];
    await asUser(
      ids.stranger,
      'select public.upsert_location($1,$2,\'{"status":"archived"}\',null)',
      [billingOrg, q.location_id],
    );
    assert.equal(
      (
        await pg.query<{ slug: string }>(
          "select slug from public.qr_codes where id=$1",
          [qrId],
        )
      ).rows[0].slug,
      q.slug,
    );
    await assert.rejects(
      () =>
        asService("select public.record_public_event($1,$2,$3)", [
          sessionId,
          "review_link_clicked",
          "new-after-archive",
        ]),
      /QR_INACTIVE/,
    );
  });
});
describe("Invitations and controlled deletion", () => {
  it("requires the exact invited verified email and only assigns selected tenant locations", async () => {
    await asUser(ids.ownerB, "select public.create_invitation($1,$2,$3,$4)", [
      orgB,
      "manager@example.test",
      "invitation_hash",
      [locB],
    ]);
    await assert.rejects(
      () =>
        asUser(
          ids.ownerA,
          "select public.accept_invitation('invitation_hash')",
        ),
      /INVITATION_INVALID/,
    );
    assert.equal(
      (
        await asUser<{ org: string }>(
          ids.manager,
          "select public.accept_invitation('invitation_hash') org",
        )
      )[0].org,
      orgB,
    );
    assert.equal(
      (await asUser(ids.manager, "select * from public.locations")).length,
      1,
    );
    await assert.rejects(
      () =>
        asUser(
          ids.manager,
          "select public.accept_invitation('invitation_hash')",
        ),
      /INVITATION_INVALID/,
    );
  });
  it("rejects an invitation assigning another tenant’s location", async () => {
    await assert.rejects(
      () =>
        asUser(ids.ownerA, "select public.create_invitation($1,$2,$3,$4)", [
          orgA,
          "manager@example.test",
          "cross_hash",
          [locB],
        ]),
      /TENANT_ACCESS_DENIED/,
    );
  });
  it("denies a manager archive through the database RPC", async () => {
    await assert.rejects(
      () =>
        asUser(
          ids.manager,
          'select public.upsert_location($1,$2,\'{"status":"archived"}\',null)',
          [orgB, locB],
        ),
      /ROLE_REQUIRED/,
    );
  });
  it("rejects invalid timezones even when bypassing API validation", async () => {
    await assert.rejects(
      () =>
        asUser(
          ids.ownerB,
          'select public.upsert_location($1,$2,\'{"timezone":"Bogus/Timezone"}\',null)',
          [orgB, locB],
        ),
      /check constraint/,
    );
  });
  it("disables scheduled workspaces before deleting data and retains billing references", async () => {
    await asUser(ids.stranger, "select public.request_account_deletion()");
    assert.equal(
      (await asUser(ids.stranger, "select * from public.locations")).length,
      0,
    );
    await pg.query(
      "update public.organizations set deletion_due_at=now()-interval '1 day' where id=$1",
      [billingOrg],
    );
    await asService("select public.remove_due_org_data()");
    assert.equal(
      (
        await pg.query(
          "select * from public.locations where organization_id=$1",
          [billingOrg],
        )
      ).rows.length,
      0,
    );
    assert.ok(
      (
        await pg.query(
          "select * from public.payment_records where organization_id=$1",
          [billingOrg],
        )
      ).rows.length > 0,
    );
    assert.equal(
      (
        await pg.query(
          "select * from public.account_deletion_requests where user_id=$1",
          [ids.stranger],
        )
      ).rows.length,
      1,
    );
  });
});

describe("Managed NFC tags in PostgreSQL", () => {
  let tag: string;
  it("registers an NFC tag atomically and deduplicates retries", async () => {
    const body = { location_id: locB, label: "Reception stand", channel: "nfc", placement: "Front desk", brand_color: "#315b43" };
    const create = () => asUser<{ id: string }>(ids.ownerB, "select public.upsert_qr($1,null,$2,$3,$4) id", [orgB, body, "nfc-create-idempotent-123", "nfc_test_stable_slug_123456789"]);
    tag = (await create())[0].id;
    assert.equal((await create())[0].id, tag);
    const row = (await asUser<{ channel: string; placement: string }>(ids.ownerB, "select channel,placement from public.qr_codes where id=$1", [tag]))[0];
    assert.deepEqual(row, { channel: "nfc", placement: "Front desk" });
    const logs = (await pg.query<{ n: number }>("select count(*)::int n from public.audit_logs where entity_id=$1 and action='nfc_created'", [tag])).rows;
    assert.equal(logs[0].n, 1);
  });
  it("isolates tag inventory and denies cross-tenant writes", async () => {
    assert.equal((await asUser(ids.ownerA, "select * from public.qr_codes where id=$1", [tag])).length, 0);
    await assert.rejects(() => asUser(ids.ownerA, "select public.upsert_qr($1,$2,$3,null,null)", [orgB, tag, { is_active: false }]), /TENANT_ACCESS_DENIED/);
  });
  it("rejects channel changes and cross-channel reuse of a request key", async () => {
    await assert.rejects(() => asUser(ids.ownerB, "select public.upsert_qr($1,$2,$3,null,null)", [orgB, tag, { channel: "qr" }]), /INVALID_LINK_UPDATE/);
    await assert.rejects(() => asUser(ids.ownerB, "select public.upsert_qr($1,null,$2,$3,$4)", [orgB, { location_id: locB, channel: "qr" }, "nfc-create-idempotent-123", "another_valid_slug_1234567890"]), /IDEMPOTENCY_CONFLICT/);
  });
  it("lets assigned managers pause tags without changing their written URL", async () => {
    await asUser(ids.manager, "select public.upsert_qr($1,$2,$3,null,null)", [orgB, tag, { is_active: false, placement: "Lobby" }]);
    const row = (await pg.query<{ slug: string; is_active: boolean; placement: string }>("select slug,is_active,placement from public.qr_codes where id=$1", [tag])).rows[0];
    assert.equal(row.slug, "nfc_test_stable_slug_123456789");
    assert.equal(row.is_active, false);
    assert.equal(row.placement, "Lobby");
    const session = (await pg.query<{ id: string }>("insert into public.public_sessions(qr_code_id,token_hash) values($1,'nfc_paused_session') returning id", [tag])).rows[0].id;
    await assert.rejects(() => asService("select public.record_public_event($1,'qr_opened','nfc-paused-open')", [session]), /QR_INACTIVE/);
  });
  it("rejects invalid channels and oversized placement even when bypassing the API", async () => {
    for (const values of [{ channel: "other" }, { channel: "nfc", placement: "x".repeat(101) }]) {
      await assert.rejects(() => asUser(ids.ownerB, "select public.upsert_qr($1,null,$2,$3,$4)", [orgB, { location_id: locB, label: "Test NFC", brand_color: "#315b43", ...values }, "nfc-invalid-create-123", "nfc_invalid_test_slug_123456789"]), /check constraint/);
    }
  });
});
