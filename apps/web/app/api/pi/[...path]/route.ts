/**
 * Server-side proxy: /api/pi/:path* → ngrok backend
 *
 * Why: EventSource cannot send custom headers, and ngrok's free tier
 * returns an HTML interstitial (no CORS header) unless the request
 * carries `ngrok-skip-browser-warning: 1`.
 * By proxying through Next.js we add that header server-side and
 * eliminate all CORS issues for every API call + SSE stream.
 */
import { NextRequest, NextResponse } from "next/server";

const UPSTREAM = "https://residency-resistant-perfected.ngrok-free.dev";

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const upstream = `${UPSTREAM}/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  headers.set("ngrok-skip-browser-warning", "1");
  // strip host so ngrok doesn't reject the request
  headers.delete("host");

  const upstreamRes = await fetch(upstream, {
    method: req.method,
    headers,
    body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    // @ts-expect-error – Node 18+ supports duplex; needed for streaming body
    duplex: "half",
  });

  const resHeaders = new Headers(upstreamRes.headers);
  // Allow the browser to read all headers (SSE needs it)
  resHeaders.set("Access-Control-Allow-Origin", "*");

  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    headers: resHeaders,
  });
}

export const GET     = handler;
export const POST    = handler;
export const PUT     = handler;
export const PATCH   = handler;
export const DELETE  = handler;
export const OPTIONS = handler;

// Required for SSE streaming — do NOT buffer the response
export const dynamic = "force-dynamic";
