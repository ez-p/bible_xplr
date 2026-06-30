// In-memory sliding-window rate limiter.
// Resets on cold starts — sufficient for low-traffic deployments.
// To upgrade to a persistent limiter (e.g. Upstash Redis), replace this
// file and keep the same { limit(ip) } interface used by the route handlers.

const windows = new Map<string, number[]>()

function slidingWindow(windowMs: number, max: number) {
  return {
    limit(key: string): { success: boolean } {
      const now = Date.now()
      const cutoff = now - windowMs
      const hits = (windows.get(key) ?? []).filter(t => t > cutoff)
      if (hits.length >= max) return { success: false }
      hits.push(now)
      windows.set(key, hits)
      return { success: true }
    },
  }
}

// 10 passage lookups per IP per minute
export const passageLimit = slidingWindow(60_000, 10)

// 20 exposition streams per IP per minute
export const expositionLimit = slidingWindow(60_000, 20)
