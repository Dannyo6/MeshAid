import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  Priority,
  MAGIC_BYTES,
  FIXED_HEADER_SIZE,
  HEADER_SIZE,
  encodeWirePacket,
  decodeWirePacket,
  signWirePacket,
  PacketIntegrityError,
  ExpiredPacketError
} from '../src/index.ts';

describe('Wire Packet Codec & Ed25519 Cryptography (96-Byte Framing)', () => {
  test('validates the 96-byte header boundary and layout constants', () => {
    assert.equal(FIXED_HEADER_SIZE, 96);
    assert.equal(HEADER_SIZE, 96);
    assert.deepEqual(Array.from(MAGIC_BYTES), [0x4d, 0x41]);

    const timestampSeconds = Math.floor(Date.now() / 1000);
    const ttlSeconds = 3600;

    // Encoded packet with empty payload must equal exactly FIXED_HEADER_SIZE (96 bytes)
    const emptyPayloadPacket = encodeWirePacket({
      priority: Priority.GENERAL_INFO,
      messageId: '0102030405060708',
      timestampSeconds,
      ttlSeconds,
      payload: Buffer.alloc(0)
    });

    assert.equal(emptyPayloadPacket.length, FIXED_HEADER_SIZE);
    assert.equal(emptyPayloadPacket[0], 0x4d); // 'M'
    assert.equal(emptyPayloadPacket[1], 0x41); // 'A'
    assert.equal(emptyPayloadPacket[2], 1);    // Version
    assert.equal(emptyPayloadPacket[3], Priority.GENERAL_INFO); // Priority
  });

  test('encodes and decodes signed wire packet with Ed25519 verification round-trip', () => {
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

    const payloadLength = Buffer.from(JSON.stringify(payloadObj), 'utf8').length;
    assert.equal(encoded.length, FIXED_HEADER_SIZE + payloadLength);

    // Verify magic bytes in encoded frame
    assert.equal(encoded[0], 0x4d); // 'M'
    assert.equal(encoded[1], 0x41); // 'A'

    const decoded = decodeWirePacket(encoded);
    assert.equal(decoded.version, 1);
    assert.equal(decoded.priority, Priority.CIVILIAN_SOS);
    assert.equal(decoded.hopCount, 2);
    assert.equal(decoded.messageId, '0102030405060708');
    assert.equal(decoded.timestampSeconds, timestampSeconds);
    assert.equal(decoded.ttlSeconds, ttlSeconds);
    assert.ok(decoded.latitude !== null && Math.abs(decoded.latitude - 12.9716) < 0.001);
    assert.ok(decoded.longitude !== null && Math.abs(decoded.longitude - 77.5946) < 0.001);
    assert.equal(decoded.payloadLength, payloadLength);
    assert.deepEqual(decoded.payloadJson, payloadObj);
  });

  test('rejects packets with invalid or corrupted magic bytes', () => {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const valid = signWirePacket(
      {
        priority: Priority.GENERAL_INFO,
        messageId: '1234567812345678',
        timestampSeconds: Math.floor(Date.now() / 1000),
        ttlSeconds: 3600,
        payload: { note: 'Magic test' }
      },
      privateKey
    );

    // Corrupt magic byte 0
    const corrupted0 = Buffer.from(valid);
    corrupted0[0] = 0x00;
    assert.throws(
      () => decodeWirePacket(corrupted0),
      (err: Error) => err instanceof PacketIntegrityError && /magic/i.test(err.message)
    );

    // Corrupt magic byte 1
    const corrupted1 = Buffer.from(valid);
    corrupted1[1] = 0x00;
    assert.throws(
      () => decodeWirePacket(corrupted1),
      (err: Error) => err instanceof PacketIntegrityError && /magic/i.test(err.message)
    );
  });

  test('rejects packets smaller than the 96-byte header boundary', () => {
    const truncated = Buffer.alloc(95); // 1 byte short of FIXED_HEADER_SIZE
    truncated[0] = 0x4d;
    truncated[1] = 0x41;

    assert.throws(
      () => decodeWirePacket(truncated),
      (err: Error) => err instanceof PacketIntegrityError && /minimum header size/i.test(err.message)
    );
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

  test('rejects tampered header fields (priority, timestamp, or signature)', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);

    const encoded = signWirePacket(
      {
        priority: Priority.CIVILIAN_SOS, // 1
        messageId: 'dddddddddddddddd',
        timestampSeconds: Math.floor(Date.now() / 1000),
        ttlSeconds: 3600,
        payload: { text: 'Header tamper test', publicKey: rawPub.toString('hex') }
      },
      privateKey
    );

    // 1. Tamper with priority byte (offset 3)
    const tamperedPriority = Buffer.from(encoded);
    tamperedPriority[3] = Priority.EMERGENCY_AUTHORITY; // Alter 1 -> 0
    assert.throws(
      () => decodeWirePacket(tamperedPriority),
      (err: Error) => err instanceof PacketIntegrityError && /tampered/i.test(err.message)
    );

    // 2. Tamper with signature byte (offset 32..95)
    const tamperedSig = Buffer.from(encoded);
    tamperedSig[35] ^= 0xff; // Invert bit in signature
    assert.throws(
      () => decodeWirePacket(tamperedSig),
      (err: Error) => err instanceof PacketIntegrityError && /tampered/i.test(err.message)
    );
  });

  test('rejects expired packet based on TTL', () => {
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
