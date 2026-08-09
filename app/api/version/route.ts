/**
 * Reports the build that is CURRENTLY deployed.
 *
 * The trick this relies on: static chunks are served from versioned URLs that
 * survive a deploy, but a request to a route like this one always reaches the
 * live deployment. So a browser running last week's bundle asks this endpoint
 * and gets back today's build ID — which is how it discovers it is stale.
 *
 * force-dynamic + no-store are both required. Without them Next.js would
 * happily pre-render this at build time and serve a frozen answer, which would
 * defeat the entire mechanism.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return NextResponse.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID || "unknown" },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "CDN-Cache-Control": "no-store",
      },
    }
  );
}
