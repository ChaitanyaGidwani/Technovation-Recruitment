/**
 * Cache policy exists here for one specific reason.
 *
 * Next.js serves an HTML document that references content-hashed JS chunks.
 * The chunks are safe to cache forever — a new build produces new filenames.
 * The DOCUMENT is the dangerous part: if a browser keeps a cached copy, it
 * keeps loading the OLD chunk names, and Vercel continues serving those old
 * chunks indefinitely so previous sessions don't break mid-request. The result
 * is an entire previous version of the app running on someone's phone, with no
 * error and no hint that anything is wrong. That is exactly what happened
 * during the Task Round: an applicant submitted through an interface that had
 * been replaced days earlier.
 *
 * So: documents must always be revalidated, hashed assets stay immutable.
 */

/** Baked into the client bundle at build time; compared against /api/version. */
const BUILD_ID =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  `local-${Date.now()}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },

  async headers() {
    return [
      {
        // Hashed filenames — safe to keep forever. Listed first and narrowly
        // so the catch-all below can't accidentally weaken it.
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Everything else: the browser may keep a copy, but it must check with
        // the server before using it. `no-cache` does NOT mean "don't store" —
        // it means "revalidate first", which is what we want: still fast via
        // 304s, but never silently stale.
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
          // Vercel's edge cache honours this separately from the browser's.
          { key: "CDN-Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
