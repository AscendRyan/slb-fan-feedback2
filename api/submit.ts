type AudienceId = "fan" | "player" | "media" | "partner" | "discount";

type SurveyPayload = {
  audience?: string;
  submittedAt?: string;
  answers?: {
    overall?: number | null;
    recommend?: number | null;
    ratings?: Record<string, number>;
    choices?: Record<string, string[]>;
    highlight?: string;
    improve?: string;
    email?: string;
    consent?: boolean;
  };
  meta?: Record<string, unknown>;
};

type EnrichedSurveyPayload = SurveyPayload & {
  audience: AudienceId;
  submittedAt: string;
  receivedAt: string;
  requestId: string;
  meta: Record<string, unknown>;
};

const AUDIENCES = new Set<AudienceId>(["fan", "player", "media", "partner", "discount"]);
const MAX_BODY_BYTES = 100_000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normaliseEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validatePayload(payload: unknown): { ok: true; payload: SurveyPayload } | { ok: false; message: string } {
  if (!isRecord(payload)) return { ok: false, message: "Expected a JSON object." };

  const audience = payload.audience;
  if (typeof audience !== "string" || !AUDIENCES.has(audience as AudienceId)) {
    return { ok: false, message: "Missing or invalid audience." };
  }

  if (!isRecord(payload.answers)) {
    return { ok: false, message: "Missing answers object." };
  }

  const email = normaliseEmail(payload.answers.email);
  if (!email || !email.includes("@")) {
    return { ok: false, message: "A valid email address is required." };
  }

  return { ok: true, payload: payload as SurveyPayload };
}

function enrichPayload(payload: SurveyPayload, request: Request): EnrichedSurveyPayload {
  const now = new Date().toISOString();
  const country = request.headers.get("x-vercel-ip-country");
  const region = request.headers.get("x-vercel-ip-country-region");
  const city = request.headers.get("x-vercel-ip-city");

  return {
    ...payload,
    audience: payload.audience as AudienceId,
    submittedAt: payload.submittedAt ?? now,
    receivedAt: now,
    requestId: crypto.randomUUID(),
    answers: {
      ...payload.answers,
      email: normaliseEmail(payload.answers?.email),
    },
    meta: {
      ...(payload.meta ?? {}),
      country: country || undefined,
      region: region || undefined,
      city: city ? decodeURIComponent(city) : undefined,
    },
  };
}

async function forwardToWebhook(name: string, url: string, payload: EnrichedSurveyPayload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "slb-fan-feedback-vercel-function",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${name} returned ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`);
  }
}

async function saveToPostgres(payload: EnrichedSurveyPayload) {
  const hasPostgresEnv = Boolean(
    process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL,
  );

  if (!hasPostgresEnv) return false;

  // Some Postgres providers expose DATABASE_URL instead of Vercel's POSTGRES_URL.
  // @vercel/postgres reads POSTGRES_URL, so mirror it when needed.
  if (!process.env.POSTGRES_URL && process.env.DATABASE_URL) {
    process.env.POSTGRES_URL = process.env.DATABASE_URL;
  }

  const { sql } = await import("@vercel/postgres");
  const answersJson = JSON.stringify(payload.answers ?? {});
  const choicesJson = JSON.stringify(payload.answers?.choices ?? {});
  const ratingsJson = JSON.stringify(payload.answers?.ratings ?? {});
  const metaJson = JSON.stringify(payload.meta ?? {});
  const payloadJson = JSON.stringify(payload);

  await sql`
    CREATE TABLE IF NOT EXISTS survey_submissions (
      id bigserial PRIMARY KEY,
      request_id text UNIQUE NOT NULL,
      audience text NOT NULL,
      submitted_at timestamptz NOT NULL,
      received_at timestamptz NOT NULL DEFAULT now(),
      email text NOT NULL,
      consent boolean NOT NULL DEFAULT false,
      overall integer,
      recommend integer,
      ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
      choices jsonb NOT NULL DEFAULT '{}'::jsonb,
      highlight text,
      improve text,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      payload jsonb NOT NULL
    )
  `;

  await sql`
    INSERT INTO survey_submissions (
      request_id,
      audience,
      submitted_at,
      received_at,
      email,
      consent,
      overall,
      recommend,
      ratings,
      choices,
      highlight,
      improve,
      meta,
      payload
    ) VALUES (
      ${payload.requestId},
      ${payload.audience},
      ${payload.submittedAt},
      ${payload.receivedAt},
      ${payload.answers?.email ?? ""},
      ${Boolean(payload.answers?.consent)},
      ${payload.answers?.overall ?? null},
      ${payload.answers?.recommend ?? null},
      ${ratingsJson}::jsonb,
      ${choicesJson}::jsonb,
      ${payload.answers?.highlight ?? null},
      ${payload.answers?.improve ?? null},
      ${metaJson}::jsonb,
      ${payloadJson}::jsonb
    )
  `;

  return true;
}

async function handlePost(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Submission is too large." }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const validation = validatePayload(body);
  if (!validation.ok) return json({ ok: false, error: validation.message }, 400);

  const payload = enrichPayload(validation.payload, request);
  const destinations: string[] = [];
  const errors: string[] = [];

  if (process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
    try {
      await forwardToWebhook("Google Sheets webhook", process.env.GOOGLE_SHEETS_WEBHOOK_URL, payload);
      destinations.push("google-sheets");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Google Sheets webhook failed.");
    }
  }

  if (process.env.SUBMISSION_WEBHOOK_URL) {
    try {
      await forwardToWebhook("Submission webhook", process.env.SUBMISSION_WEBHOOK_URL, payload);
      destinations.push("webhook");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Submission webhook failed.");
    }
  }

  try {
    const savedToPostgres = await saveToPostgres(payload);
    if (savedToPostgres) destinations.push("postgres");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Postgres save failed.");
  }

  if (destinations.length === 0) {
    console.error("Survey submission was received but no storage destination is configured.", {
      requestId: payload.requestId,
      audience: payload.audience,
      errors,
    });
    return json(
      {
        ok: false,
        requestId: payload.requestId,
        error:
          "No submission storage is configured. Add GOOGLE_SHEETS_WEBHOOK_URL, SUBMISSION_WEBHOOK_URL, or Vercel Postgres environment variables.",
        details: errors,
      },
      errors.length > 0 ? 502 : 501,
    );
  }

  return json({ ok: true, requestId: payload.requestId, destinations, warnings: errors }, errors.length ? 207 : 200);
}

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (request.method === "GET") {
      return json({
        ok: true,
        route: "/api/submit",
        accepts: "POST application/json",
        destinations: {
          googleSheetsWebhook: Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_URL),
          webhook: Boolean(process.env.SUBMISSION_WEBHOOK_URL),
          postgres: Boolean(
            process.env.POSTGRES_URL ||
              process.env.POSTGRES_PRISMA_URL ||
              process.env.POSTGRES_URL_NON_POOLING ||
              process.env.DATABASE_URL,
          ),
        },
      });
    }
    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
    return handlePost(request);
  },
};
