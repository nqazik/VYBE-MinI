import { parseTimestamp } from './sync'

/**
 * Estimates the offset between this device's clock and the database server's clock.
 * Phone clocks can be seconds off; the shared playhead is timestamped by the server,
 * so every device needs to know the server time to compute where the playhead is.
 */
export class ServerClock {
  offsetMs = 0
  /** Round-trip time of the best sample, in ms. */
  rttMs = 0

  /** Server "now" in ms since epoch. */
  now = (): number => Date.now() + this.offsetMs

  /** Seconds a message sent now takes to reach the server (used to compensate host commands). */
  get oneWaySeconds(): number {
    return Math.min(this.rttMs, 2000) / 2000
  }

  /** `fetchServerTime` must resolve with the server's timestamp string. Takes the lowest-latency of a few samples. */
  async sync(fetchServerTime: () => Promise<string>, samples = 4): Promise<void> {
    let best: { rtt: number; offset: number } | null = null
    for (let i = 0; i < samples; i++) {
      const t0 = Date.now()
      try {
        const serverTime = parseTimestamp(await fetchServerTime())
        const t1 = Date.now()
        const rtt = t1 - t0
        const offset = serverTime + rtt / 2 - t1
        if (!best || rtt < best.rtt) best = { rtt, offset }
      } catch {
        /* ignore a failed sample */
      }
    }
    if (best) {
      this.offsetMs = best.offset
      this.rttMs = best.rtt
    }
  }
}
