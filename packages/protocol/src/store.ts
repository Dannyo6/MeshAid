/**
 * Store-Carry-Forward Local Spool & Deduplication Engine
 */

import { Priority } from './types.ts';
import type { MeshAidEnvelope, MessageSummary } from './types.ts';
import { isPacketExpired } from './packet.ts';

export class MessageStore {
  private bundles: Map<string, MeshAidEnvelope> = new Map();
  private seenMessageIds: Set<string> = new Set();
  private maxStorageCount: number;

  constructor(maxStorageCount: number = 1000) {
    this.maxStorageCount = maxStorageCount;
  }

  /**
   * Has this node ever observed or processed this Message ID?
   */
  public hasSeen(id: string): boolean {
    return this.seenMessageIds.has(id);
  }

  /**
   * Attempts to ingest an incoming envelope from an encounter or local generation
   * Returns true if newly stored, false if duplicate or expired
   */
  public ingest(envelope: MeshAidEnvelope, isRelay: boolean = false, nowMs: number = Date.now()): {
    success: boolean;
    reason: 'STORED' | 'DUPLICATE' | 'EXPIRED' | 'MAX_HOPS_EXCEEDED';
  } {
    // 1. Duplicate check
    if (this.seenMessageIds.has(envelope.id)) {
      return { success: false, reason: 'DUPLICATE' };
    }

    // 2. TTL check
    if (isPacketExpired(envelope, nowMs)) {
      return { success: false, reason: 'EXPIRED' };
    }

    // 3. Max hops check
    if (isRelay && envelope.hopCount >= envelope.maxHops) {
      return { success: false, reason: 'MAX_HOPS_EXCEEDED' };
    }

    // Clone and prepare envelope
    const toStore: MeshAidEnvelope = {
      ...envelope,
      hopCount: isRelay ? envelope.hopCount + 1 : envelope.hopCount
    };

    // Mark as seen permanently in deduplication filter
    this.seenMessageIds.add(toStore.id);

    // Bounded storage eviction if full (evict lowest priority P3 first)
    if (this.bundles.size >= this.maxStorageCount) {
      this.evictLowestPriority();
    }

    this.bundles.set(toStore.id, toStore);
    return { success: true, reason: 'STORED' };
  }

  /**
   * Returns a lightweight summary manifest of currently held, non-expired bundles
   */
  public getManifest(nowMs: number = Date.now()): MessageSummary[] {
    this.pruneExpired(nowMs);
    const summaries: MessageSummary[] = [];
    for (const bundle of this.bundles.values()) {
      summaries.push({
        id: bundle.id,
        priority: bundle.priority,
        timestamp: bundle.timestamp,
        ttl: bundle.ttl
      });
    }
    return summaries;
  }

  /**
   * Retrieves stored bundles sorted strictly by Priority (P0 -> P1 -> P2 -> P3),
   * then by oldest Timestamp first.
   */
  public getBundlesForForwarding(requestedIds?: string[], nowMs: number = Date.now()): MeshAidEnvelope[] {
    this.pruneExpired(nowMs);
    const candidates: MeshAidEnvelope[] = [];

    for (const bundle of this.bundles.values()) {
      if (requestedIds && !requestedIds.includes(bundle.id)) {
        continue;
      }
      candidates.push(bundle);
    }

    return candidates.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority; // P0 (0) before P1 (1)
      }
      return a.timestamp - b.timestamp; // Oldest first
    });
  }

  public getBundle(id: string): MeshAidEnvelope | undefined {
    return this.bundles.get(id);
  }

  public getStoredCount(): number {
    return this.bundles.size;
  }

  public getSeenCount(): number {
    return this.seenMessageIds.size;
  }

  /**
   * Evicts expired packets from the forwardable bundle store
   */
  public pruneExpired(nowMs: number = Date.now()): number {
    let prunedCount = 0;
    for (const [id, bundle] of this.bundles.entries()) {
      if (isPacketExpired(bundle, nowMs)) {
        this.bundles.delete(id);
        prunedCount++;
      }
    }
    return prunedCount;
  }

  private evictLowestPriority(): void {
    // Find oldest packet with highest priority number (P3 lowest urgency)
    let victimId: string | null = null;
    let lowestPriority = -1;
    let oldestTime = Infinity;

    for (const [id, bundle] of this.bundles.entries()) {
      if (bundle.priority > lowestPriority) {
        lowestPriority = bundle.priority;
        oldestTime = bundle.timestamp;
        victimId = id;
      } else if (bundle.priority === lowestPriority && bundle.timestamp < oldestTime) {
        oldestTime = bundle.timestamp;
        victimId = id;
      }
    }

    if (victimId) {
      this.bundles.delete(victimId);
    }
  }
}
