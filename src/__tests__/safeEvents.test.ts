import { describe, it, expect } from "vitest";
import {
  buildExecutedMultisigTransaction,
  buildIncomingEther,
  buildErc20Token,
  buildErc721Token,
} from "../safeEvents";
import { applyPortOverride } from "../rabbitmq";

// Spec reference: https://github.com/safe-global/safe-events-service#events-supported
// These tests pin the exact JSON shape — any deviation breaks the contract
// with downstream consumers that expect to slot us in for Safe TX Service.

const CHAIN_ID = 100;
const SAFE = "0xad5a96a2c9757556e1f0220e737c18af69a36a96";
const SAFE_CKSUM = "0xaD5A96a2c9757556e1F0220e737C18aF69A36a96";
const TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const TOKEN_CKSUM = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const TO_ADDR = "0x29fcb43b46531bca003ddc8fcb67ffe91900c762";
const TO_ADDR_CKSUM = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const TX_HASH = "0x6db4c78a70b0e24b77e2efb9c042a59da61f9be191bbec2af0166310228ee671";
const SAFE_TX_HASH = "0xCAfeBABEdeadBEEF00112233445566778899aabbccddeeff0011223344556677";

describe("buildExecutedMultisigTransaction", () => {
  it("produces the exact spec shape with failed=\"false\" on success", () => {
    expect(
      buildExecutedMultisigTransaction({
        chainId: CHAIN_ID,
        safeAddress: SAFE,
        safeTxHash: SAFE_TX_HASH,
        to: TO_ADDR,
        data: "0xdeadbeef",
        success: true,
        txHash: TX_HASH,
      }),
    ).toEqual({
      address: SAFE_CKSUM,
      type: "EXECUTED_MULTISIG_TRANSACTION",
      safeTxHash: SAFE_TX_HASH.toLowerCase(),
      to: TO_ADDR_CKSUM,
      data: "0xdeadbeef",
      failed: "false",
      txHash: TX_HASH,
      chainId: "100",
    });
  });

  it("maps success=false to failed=\"true\"", () => {
    const out = buildExecutedMultisigTransaction({
      chainId: 1,
      safeAddress: SAFE,
      safeTxHash: SAFE_TX_HASH,
      to: TO_ADDR,
      data: "0xdeadbeef",
      success: false,
      txHash: TX_HASH,
    });
    expect(out.failed).toBe("true");
    expect(out.chainId).toBe("1");
  });

  it("collapses empty data (null or '0x') to null per spec", () => {
    expect(
      buildExecutedMultisigTransaction({
        chainId: CHAIN_ID,
        safeAddress: SAFE,
        safeTxHash: SAFE_TX_HASH,
        to: TO_ADDR,
        data: null,
        success: true,
        txHash: TX_HASH,
      }).data,
    ).toBeNull();

    expect(
      buildExecutedMultisigTransaction({
        chainId: CHAIN_ID,
        safeAddress: SAFE,
        safeTxHash: SAFE_TX_HASH,
        to: TO_ADDR,
        data: "0x",
        success: true,
        txHash: TX_HASH,
      }).data,
    ).toBeNull();
  });

  it("EIP-55-checksums address and to fields regardless of input casing", () => {
    const out = buildExecutedMultisigTransaction({
      chainId: CHAIN_ID,
      safeAddress: SAFE.toUpperCase().replace("0X", "0x"),
      safeTxHash: SAFE_TX_HASH,
      to: TO_ADDR.toUpperCase().replace("0X", "0x"),
      data: "0xdeadbeef",
      success: true,
      txHash: TX_HASH,
    });
    expect(out.address).toBe(SAFE_CKSUM);
    expect(out.to).toBe(TO_ADDR_CKSUM);
  });
});

describe("buildIncomingEther", () => {
  it("produces the exact spec shape", () => {
    expect(
      buildIncomingEther({
        chainId: CHAIN_ID,
        safeAddress: SAFE,
        txHash: TX_HASH,
        value: 1_000_000_000_000_000_000n,
      }),
    ).toEqual({
      address: SAFE_CKSUM,
      type: "INCOMING_ETHER",
      txHash: TX_HASH,
      value: "1000000000000000000",
      chainId: "100",
    });
  });

  it("stringifies a 0 value cleanly", () => {
    expect(
      buildIncomingEther({ chainId: 1, safeAddress: SAFE, txHash: TX_HASH, value: 0n }).value,
    ).toBe("0");
  });
});

describe("buildErc20Token", () => {
  it("INCOMING_TOKEN shape (token + value, no tokenId)", () => {
    const out = buildErc20Token({
      chainId: CHAIN_ID,
      safeAddress: SAFE,
      tokenAddress: TOKEN,
      txHash: TX_HASH,
      value: 123_456n,
      direction: "INCOMING_TOKEN",
    });
    expect(out).toEqual({
      address: SAFE_CKSUM,
      type: "INCOMING_TOKEN",
      tokenAddress: TOKEN_CKSUM,
      txHash: TX_HASH,
      value: "123456",
      chainId: "100",
    });
    expect("tokenId" in out).toBe(false);
  });

  it("OUTGOING_TOKEN shape with checksummed tokenAddress", () => {
    const out = buildErc20Token({
      chainId: 1,
      safeAddress: SAFE,
      tokenAddress: TOKEN,
      txHash: TX_HASH,
      value: 1n,
      direction: "OUTGOING_TOKEN",
    });
    expect(out.type).toBe("OUTGOING_TOKEN");
    expect(out.tokenAddress).toBe(TOKEN_CKSUM);
  });
});

describe("applyPortOverride", () => {
  it("returns the URL unchanged when port env is unset or empty", () => {
    expect(applyPortOverride("amqp://host", undefined)).toBe("amqp://host");
    expect(applyPortOverride("amqp://host", "")).toBe("amqp://host");
    expect(applyPortOverride("amqp://host", "   ")).toBe("amqp://host");
  });

  it("injects the port into a URL with no explicit port", () => {
    expect(applyPortOverride("amqp://user:pass@host/vhost", "5672")).toBe(
      "amqp://user:pass@host:5672/vhost",
    );
  });

  it("overrides an existing port in the URL when the env var is set", () => {
    expect(applyPortOverride("amqp://host:1234/vhost", "5672")).toBe(
      "amqp://host:5672/vhost",
    );
  });

  it("preserves the scheme (amqps) when overriding", () => {
    expect(applyPortOverride("amqps://host/vhost", "5671")).toBe(
      "amqps://host:5671/vhost",
    );
  });

  it("throws for non-numeric / out-of-range port values", () => {
    expect(() => applyPortOverride("amqp://host", "abc")).toThrow();
    expect(() => applyPortOverride("amqp://host", "0")).toThrow();
    expect(() => applyPortOverride("amqp://host", "99999")).toThrow();
  });
});

describe("buildErc721Token", () => {
  it("INCOMING_TOKEN shape (token + tokenId, no value)", () => {
    const out = buildErc721Token({
      chainId: CHAIN_ID,
      safeAddress: SAFE,
      tokenAddress: TOKEN,
      txHash: TX_HASH,
      tokenId: 42n,
      direction: "INCOMING_TOKEN",
    });
    expect(out).toEqual({
      address: SAFE_CKSUM,
      type: "INCOMING_TOKEN",
      tokenAddress: TOKEN_CKSUM,
      txHash: TX_HASH,
      tokenId: "42",
      chainId: "100",
    });
    expect("value" in out).toBe(false);
  });

  it("OUTGOING_TOKEN with a large tokenId stringifies losslessly", () => {
    const huge = 2n ** 200n - 1n;
    expect(
      buildErc721Token({
        chainId: CHAIN_ID,
        safeAddress: SAFE,
        tokenAddress: TOKEN,
        txHash: TX_HASH,
        tokenId: huge,
        direction: "OUTGOING_TOKEN",
      }).tokenId,
    ).toBe(huge.toString());
  });
});
