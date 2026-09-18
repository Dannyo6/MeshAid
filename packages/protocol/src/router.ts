/**
 * Opportunistic Encounter Router & Mesh Node Simulation Engine
 */

import { Priority } from './types.ts';
import type { MeshAidEnvelope, GeoLocation, ManifestOffer, ManifestRequest } from './types.ts';
import { MessageStore } from './store.ts';
import { createEnvelope } from './packet.ts';

export class MeshAidNode {
  public readonly nodeId: string;
  public readonly store: MessageStore;

  constructor(nodeId: string, maxStorage: number = 1000) {
    this.nodeId = nodeId;
    this.store = new MessageStore(maxStorage);
  }

  /**
   * Generates a new locally authored SOS emergency bundle
   */
  public createSOS(
    details: string,
    options?: {
      category?: string;
      injuredCount?: number;
      location?: GeoLocation;
      priority?: Priority;
      ttlSeconds?: number;
    }
  ): MeshAidEnvelope {
    const envelope = createEnvelope({
      senderId: this.nodeId,
      recipientId: 'BROADCAST',
      priority: options?.priority ?? Priority.CIVILIAN_SOS,
      ttlSeconds: options?.ttlSeconds ?? 172800,
      type: 'SOS',
      payload: {
        category: options?.category ?? 'GENERAL_DISTRESS',
        details,
        injuredCount: options?.injuredCount ?? 0
      },
      location: options?.location
    });

    this.store.ingest(envelope, false);
    return envelope;
  }

  /**
   * Step 1 of Encounter: Prepare manifest offer of held forwardable messages
   */
  public prepareManifestOffer(): ManifestOffer {
    return {
      type: 'MANIFEST_OFFER',
      senderNodeId: this.nodeId,
      items: this.store.getManifest()
    };
  }

  /**
   * Step 2 of Encounter: Peer inspects offer and replies with list of missing/wanted message IDs
   */
  public handleManifestOffer(offer: ManifestOffer): ManifestRequest {
    const wanted: string[] = [];
    for (const item of offer.items) {
      if (!this.store.hasSeen(item.id)) {
        wanted.push(item.id);
      }
    }
    return {
      type: 'MANIFEST_REQUEST',
      senderNodeId: this.nodeId,
      requestedIds: wanted
    };
  }

  /**
   * Step 3 of Encounter: Retrieve requested bundles sorted strictly by Priority
   */
  public fulfillManifestRequest(request: ManifestRequest): MeshAidEnvelope[] {
    return this.store.getBundlesForForwarding(request.requestedIds);
  }

  /**
   * Step 4 of Encounter: Ingest received bundles from peer
   */
  public receiveTransferredBundles(bundles: MeshAidEnvelope[]): {
    receivedCount: number;
    storedCount: number;
    duplicateCount: number;
  } {
    let stored = 0;
    let dupes = 0;

    for (const bundle of bundles) {
      const res = this.store.ingest(bundle, true);
      if (res.success) {
        stored++;
      } else if (res.reason === 'DUPLICATE') {
        dupes++;
      }
    }

    return {
      receivedCount: bundles.length,
      storedCount: stored,
      duplicateCount: dupes
    };
  }

  /**
   * Simulates a bidirectional BLE RF encounter between this node and a peer node
   */
  public executeEncounter(peer: MeshAidNode): {
    forwardedToPeer: number;
    receivedFromPeer: number;
  } {
    // 1. This node -> Peer
    const offerToPeer = this.prepareManifestOffer();
    const peerRequest = peer.handleManifestOffer(offerToPeer);
    const bundlesToPeer = this.fulfillManifestRequest(peerRequest);
    const peerResult = peer.receiveTransferredBundles(bundlesToPeer);

    // 2. Peer -> This node
    const offerFromPeer = peer.prepareManifestOffer();
    const myRequest = this.handleManifestOffer(offerFromPeer);
    const bundlesFromPeer = peer.fulfillManifestRequest(myRequest);
    const myResult = this.receiveTransferredBundles(bundlesFromPeer);

    return {
      forwardedToPeer: peerResult.storedCount,
      receivedFromPeer: myResult.storedCount
    };
  }
}
