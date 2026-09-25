import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  Priority,
  HEADER_SIZE,
  encodeWirePacket,
  decodeWirePacket,
  signWirePacket,
  PacketIntegrityError,
  ExpiredPacketError
} from '../src/index.ts';

describe('Wire Packet Codec & Ed25519 Cryptography', () => {
  test('encodes and decodes signed wire packet with Ed25519 verification', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);

    const payloadObj = {
      type: 'SOS',
      category: 'COLLAPSE',
      details: 'Building damaged',
      publicKey: rawPub.toString('hex')
    };

    const timestampSeconds = Math.floor(Date.now() / 1000);
    const ttlSeconds = 3600;

    const encoded = signWirePacket(
      {
        priority: Priority.CIVILIAN_SOS,
        hopCount: 2,
        messageId: '0102030405060708',
        timestampSeconds,
        ttlSeconds,
        latitude: 12.9716,
        longitude: 77.5946,
        payload: payloadObj
      },
      privateKey
    );

    assert.equal(encoded.length >= HEADER_SIZE, true);

    const decoded = decodeWirePacket(encoded);
    assert.equal(decoded.version, 1);
    assert.equal(decoded.priority, Priority.CIVILIAN_SOS);
    assert.equal(decoded.hopCount, 2);
    assert.equal(decoded.messageId, '0102030405060708');
    assert.equal(decoded.timestampSeconds, timestampSeconds);
    assert.equal(decoded.ttlSeconds, ttlSeconds);
    assert.ok(decoded.latitude !== null && Math.abs(decoded.latitude - 12.9716) < 0.001);
    assert.ok(decoded.longitude !== null && Math.abs(decoded.longitude - 77.5946) < 0.001);
    assert.deepEqual(decoded.payloadJson, payloadObj);
  });

  test('rejects unsigned packet (all zeros signature)', () => {
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const unsigned = encodeWirePacket({
      priority: Priority.GENERAL_INFO,
      messageId: 'aaaaaaaaaaaaaaaa',
      timestampSeconds,
      ttlSeconds: 3600,
      payload: { note: 'Unsigned bulletin' }
    });

    assert.throws(
      () => decodeWirePacket(unsigned),
      (err: Error) => err instanceof PacketIntegrityError && /unsigned/i.test(err.message)
    );
  });

  test('rejects tampered payload', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);

    const encoded = signWirePacket(
      {
        priority: Priority.CIVILIAN_SOS,
        messageId: 'bbbbbbbbbbbbbbbb',
        timestampSeconds: Math.floor(Date.now() / 1000),
        ttlSeconds: 3600,
        payload: { text: 'Genuine message', publicKey: rawPub.toString('hex') }
      },
      privateKey
    );

    // Tamper with payload byte inside "Genuine" without breaking JSON syntax
    const tampered = Buffer.from(encoded);
    const textIdx = tampered.indexOf(Buffer.from('Genuine'));
    assert.ok(textIdx > 0);
    tampered[textIdx] = 'M'.charCodeAt(0); // "Menuine"

    assert.throws(
      () => decodeWirePacket(tampered),
      (err: Error) => err instanceof PacketIntegrityError && /tampered/i.test(err.message)
    );

    // Also test with explicit public key option
    assert.throws(
      () => decodeWirePacket(tampered, { publicKey: rawPub }),
      (err: Error) => err instanceof PacketIntegrityError && /tampered/i.test(err.message)
    );
  });

  test('rejects expired packet', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);

    const now = Math.floor(Date.now() / 1000);
    const expired = signWirePacket(
      {
        priority: Priority.CIVILIAN_SOS,
        messageId: 'cccccccccccccccc',
        timestampSeconds: now - 7200,
        ttlSeconds: 3600,
        payload: { text: 'Old message', publicKey: rawPub.toString('hex') }
      },
      privateKey
    );

    assert.throws(
      () => decodeWirePacket(expired, { currentTimeSeconds: now }),
      (err: Error) => err instanceof ExpiredPacketError
    );
  });
});
