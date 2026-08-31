import type { ApiHealth } from "@ssm-usor/contracts";

const json = (body: unknown, init: ResponseInit = {}) =>
  Response.json(body, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...init.headers,
    },
  });

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        status: "ok",
        service: "ssm-usor-api",
      } satisfies ApiHealth);
    }

    return json(
      {
        error: "not_found",
        message: "The requested API route does not exist.",
      },
      { status: 404 },
    );
  },
} satisfies ExportedHandler;
