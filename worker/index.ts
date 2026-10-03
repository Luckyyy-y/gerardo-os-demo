/** Cloudflare Worker entry point for the vinext-starter template. */
import { createRemoteJWKSet, jwtVerify } from "jose";
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

const OWNER_HEADER = "x-gerardo-authenticated-user-id";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_ISSUER?: string;
  CF_ACCESS_JWKS?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function unauthorized() {
  return Response.json(
    { error: "Sign in through Cloudflare Access is required." },
    { status: 401, headers: { "Cache-Control": "private, no-store" } },
  );
}

async function authenticateWorkspaceRequest(request: Request, env: Env) {
  const headers = new Headers(request.headers);
  // Never trust the private identity header supplied by a browser or API client.
  headers.delete(OWNER_HEADER);

  if (env.CF_ACCESS_AUD && env.CF_ACCESS_ISSUER && env.CF_ACCESS_JWKS) {
    const token = headers.get("cf-access-jwt-assertion");
    if (!token) return null;

    try {
      let jwks = jwksCache.get(env.CF_ACCESS_JWKS);
      if (!jwks) {
        jwks = createRemoteJWKSet(new URL(env.CF_ACCESS_JWKS));
        jwksCache.set(env.CF_ACCESS_JWKS, jwks);
      }

      const { payload } = await jwtVerify(token, jwks, {
        audience: env.CF_ACCESS_AUD,
        issuer: env.CF_ACCESS_ISSUER,
        algorithms: ["RS256"],
      });
      const identity = payload.sub ||
        (typeof payload.email === "string" ? payload.email : undefined);
      if (!identity) return null;
      headers.set(OWNER_HEADER, `cloudflare:${identity}`);
    } catch {
      return null;
    }
  } else {
    // Standalone Cloudflare deployment: missing verification settings fail closed.
    return null;
  }

  return new Request(request, { headers });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (url.pathname.startsWith("/api/")) {
      const authenticatedRequest = await authenticateWorkspaceRequest(request, env);
      if (!authenticatedRequest) return unauthorized();
      return handler.fetch(authenticatedRequest, env, ctx);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
