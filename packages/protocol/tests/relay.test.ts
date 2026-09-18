/**
 * MeshAid Protocol & Store-Carry-Forward Simulation Test Suite
 * Validates the Central Proof-of-Concept: Phone A -> Phone B -> Phone C
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  Priority,
  createEnvelope,
  serializeEnvelope,
  deserializeEnvelope,
  isPacketExpired,
  MessageStore,
  MeshAidNode
} from '../src/index.ts';

describe('MeshAid Protocol Core & Packet Engine', () => {
  test('creates, serializes, and deserializes a canonical SOS envelope with checksum validation', () => {
    const envelope = createEnvelope({
      senderId: 'node_alpha_1',
      priority: Priority.CIVILIAN_SOS,
      type: 'SOS',
      payload: {
        category: 'COLLAPSE',
        details: 'Civilian building collapsed, 3 persons trapped',
        injuredCount: 3
      },
      location: {
        lat: 12.9716,
        lng: 77.5946,
        accuracyM: 5.0
      }
    });

    assert.equal(envelope.version, 1);
    assert.equal(envelope.priority, Priority.CIVILIAN_SOS);
    assert.equal(envelope.recipientId, 'BROADCAST');
    assert.equal(envelope.hopCount, 0);
    assert.equal(typeof envelope.id, 'string');
    assert.equal(envelope.id.length, 16);

    const serialized = serializeEnvelope(envelope);
    const parsed = deserializeEnvelope(serialized);

    assert.equal(parsed.id, envelope.id);
    assert.equal(parsed.checksum, envelope.checksum);
    assert.deepEqual(parsed.payload, envelope.payload);
  });

  test('rejects tampered payloads where checksum does not match', () => {
    const envelope = createEnvelope({
      senderId: 'node_alpha_1',
      priority: Priority.CIVILIAN_SOS,
      type: 'SOS',
      payload: { details: 'Genuine emergency at Sector 4' }
    });

    const serialized = serializeEnvelope(envelope);
    // Maliciously tamper with the payload string in transit
    const tampered = serialized.replace('Sector 4', 'Sector 999');

    assert.throws(() => {
      deserializeEnvelope(tampered);
    }, /Checksum mismatch/);
  });

  test('correctly identifies expired packets based on TTL', () => {
    const now = Date.now();
    const freshEnvelope = createEnvelope({
      senderId: 'node_1',
      priority: Priority.GENERAL_INFO,
      type: 'BULLETIN',
      payload: { note: 'Fresh info' },
      timestamp: now,
      ttlSeconds: 60 // 60s
    });

    assert.equal(isPacketExpired(freshEnvelope, now + 30_000), false);
    assert.equal(isPacketExpired(freshEnvelope, now + 65_000), true);
  });
});

describe('MessageStore & Deduplication Engine', () => {
  test('suppresses duplicate message ingestion', () => {
    const store = new MessageStore();
    const env = createEnvelope({
      senderId: 'node_src',
      priority: Priority.CIVILIAN_SOS,
      type: 'SOS',
      payload: { alert: 'Flood waters rising' }
    });

    const firstIngest = store.ingest(env, false);
    assert.equal(firstIngest.success, true);
    assert.equal(firstIngest.reason, 'STORED');
    assert.equal(store.getStoredCount(), 1);
    assert.equal(store.getSeenCount(), 1);

    // Second ingestion of identical message
    const secondIngest = store.ingest(env, true);
    assert.equal(secondIngest.success, false);
    assert.equal(secondIngest.reason, 'DUPLICATE');
    assert.equal(store.getStoredCount(), 1); // Storage count remains 1
  });

  test('schedules forwarding queues strictly by Priority tier (P0 -> P1 -> P2 -> P3)', () => {
    const store = new MessageStore();

    const p3General = createEnvelope({
      senderId: 'node_3',
      priority: Priority.GENERAL_INFO,
      type: 'BULLETIN',
      payload: { text: 'P3: Road open at south entrance' }
    });
    const p1Sos = createEnvelope({
      senderId: 'node_1',
      priority: Priority.CIVILIAN_SOS,
      type: 'SOS',
      payload: { text: 'P1: Severe injuries at Sector 2' }
    });
    const p0Authority = createEnvelope({
      senderId: 'node_0',
      priority: Priority.EMERGENCY_AUTHORITY,
      type: 'BULLETIN',
      payload: { text: 'P0: Mandatory Dam Evacuation Order' }
    });
    const p2Resource = createEnvelope({
      senderId: 'node_2',
      priority: Priority.RESOURCE_LOGISTICS,
      type: 'RESOURCE_REQ',
      payload: { text: 'P2: Urgent request for 10 units O+ blood' }
    });

    // Ingest in mixed/reverse order
    store.ingest(p3General);
    store.ingest(p1Sos);
    store.ingest(p0Authority);
    store.ingest(p2Resource);

    const forwardingQueue = store.getBundlesForForwarding();
    assert.equal(forwardingQueue.length, 4);

    // Assert strict priority order
    assert.equal(forwardingQueue[0].priority, Priority.EMERGENCY_AUTHORITY); // P0
    assert.equal(forwardingQueue[1].priority, Priority.CIVILIAN_SOS);        // P1
    assert.equal(forwardingQueue[2].priority, Priority.RESOURCE_LOGISTICS);  // P2
    assert.equal(forwardingQueue[3].priority, Priority.GENERAL_INFO);         // P3
  });

  test('prunes expired messages from forwardable cache', () => {
    const store = new MessageStore();
    const now = 1_000_000;

    const shortLived = createEnvelope({
      senderId: 'node_short',
      priority: Priority.GENERAL_INFO,
      type: 'BULLETIN',
      payload: { msg: 'Transient notice' },
      timestamp: now,
      ttlSeconds: 10
    });

    store.ingest(shortLived, false, now);
    assert.equal(store.getStoredCount(), 1);

    // Before expiration
    assert.equal(store.getBundlesForForwarding(undefined, now + 5000).length, 1);

    // After expiration (15 seconds later)
    assert.equal(store.getBundlesForForwarding(undefined, now + 15000).length, 0);
    assert.equal(store.getStoredCount(), 0);
    // Crucially, it must still be remembered in the seen filter to prevent zombie re-infection!
    assert.equal(store.hasSeen(shortLived.id), true);
  });
});

describe('Central Proof-of-Concept: Three-Device Store-Carry-Forward (A -> B -> C)', () => {
  test('Phone A reaches Phone C strictly via intermediary Phone B relay', () => {
    // 1. Initialize three autonomous edge nodes
    const phoneA = new MeshAidNode('PHONE_A_SENDER');
    const phoneB = new MeshAidNode('PHONE_B_RELAY');
    const phoneC = new MeshAidNode('PHONE_C_RECEIVER');

    // Phone A and Phone C are isolated (no direct connection)
    let directConnectionAllowed = false;
    function attemptDirectAtoC(): boolean {
      if (!directConnectionAllowed) {
        return false; // Physical RF barrier / beyond range
      }
      phoneA.executeEncounter(phoneC);
      return true;
    }

    assert.equal(attemptDirectAtoC(), false, 'Phone A and Phone C cannot directly communicate');

    // 2. Phone A generates a critical civilian SOS while in disaster sector
    const sosPayload = {
      category: 'MEDICAL_EMERGENCY',
      details: 'Patient with severe trauma, requires rapid paramedic evacuation',
      injuredCount: 1
    };
    const sosEnvelope = phoneA.createSOS(sosPayload.details, {
      category: sosPayload.category,
      injuredCount: sosPayload.injuredCount,
      priority: Priority.CIVILIAN_SOS,
      location: { lat: 12.971598, lng: 77.594566, accuracyM: 4.2 }
    });

    assert.equal(phoneA.store.getStoredCount(), 1);
    assert.equal(phoneB.store.getStoredCount(), 0);
    assert.equal(phoneC.store.getStoredCount(), 0);

    // 3. Relay Phone B physically walks/moves into wireless range of Phone A
    const encounterAB = phoneA.executeEncounter(phoneB);
    assert.equal(encounterAB.forwardedToPeer, 1, 'Phone A must forward 1 SOS bundle to Phone B');

    // Verify Phone B now safely caches the message in its local store
    assert.equal(phoneB.store.getStoredCount(), 1);
    const bundleOnB = phoneB.store.getBundle(sosEnvelope.id);
    assert.ok(bundleOnB);
    assert.equal(bundleOnB.id, sosEnvelope.id);
    assert.equal(bundleOnB.hopCount, 1, 'Hop count must be incremented to 1 on relay B');

    // Verify Phone C still has not received the message (A and C never communicated)
    assert.equal(phoneC.store.getStoredCount(), 0);

    // 4. Phone B walks out of range of Phone A, and subsequently moves into range of Phone C
    // Phone B encounters Phone C
    const encounterBC = phoneB.executeEncounter(phoneC);
    assert.equal(encounterBC.forwardedToPeer, 1, 'Phone B must forward 1 SOS bundle to Phone C');

    // 5. Verify Phone C has received, verified, and stored the SOS!
    assert.equal(phoneC.store.getStoredCount(), 1);
    const deliveredSOS = phoneC.store.getBundle(sosEnvelope.id);
    assert.ok(deliveredSOS);
    assert.equal(deliveredSOS.id, sosEnvelope.id);
    assert.equal(deliveredSOS.senderId, 'PHONE_A_SENDER');
    assert.equal(deliveredSOS.priority, Priority.CIVILIAN_SOS);
    assert.equal(deliveredSOS.hopCount, 2, 'Hop count must be 2 after traversing relay B');
    assert.deepEqual(deliveredSOS.payload, {
      category: 'MEDICAL_EMERGENCY',
      details: 'Patient with severe trauma, requires rapid paramedic evacuation',
      injuredCount: 1
    });

    // 6. Test Duplicate Suppression on Re-Encounter:
    // If Phone B and Phone C encounter each other again, no duplicate transfer should occur
    const reEncounterBC = phoneB.executeEncounter(phoneC);
    assert.equal(reEncounterBC.forwardedToPeer, 0, 'Zero bundles forwarded on repeat encounter');
    assert.equal(reEncounterBC.receivedFromPeer, 0, 'Zero bundles received on repeat encounter');
    assert.equal(phoneC.store.getStoredCount(), 1, 'Phone C store still contains exactly 1 bundle');

    // The central demonstration A -> B -> C is completely validated!
  });
});
