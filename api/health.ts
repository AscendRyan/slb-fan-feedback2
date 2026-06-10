export default {
  fetch() {
    return new Response(
      JSON.stringify({
        ok: true,
        service: "slb-fan-feedback",
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
      }),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  },
};
