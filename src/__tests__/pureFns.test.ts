import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { encodeFunctionData, zeroAddress } from "viem";
import {
  resolveVersionFromMasterCopy,
  isL1Safe,
  MASTER_COPY_TO_VERSION,
  SETUP_ABI_V1_0_0,
  SETUP_ABI_V1_1_1,
  EXEC_TRANSACTION_ABI,
} from "../consts";
import type { SafeVersion } from "../consts";
import {
  decodeSetupInput,
  decodeExecTransaction,
  decodeCreateProxyWithNonceInitializer,
  findCreatorFromTraceList,
  type TraceTransactionItem,
} from "../hypersync";
import { addr, MASTER_COPIES } from "./fixtures/addresses";

describe("resolveVersionFromMasterCopy", () => {
  it.each(Object.entries(MASTER_COPY_TO_VERSION))(
    "maps %s -> %s",
    (address, expected) => {
      expect(resolveVersionFromMasterCopy(address)).toBe(expected);
    },
  );

  it("is case-insensitive on input", () => {
    const address = "0xD9Db270C1B5e3Bd161e8c8503c55cEABEE709552"; // mixed case
    expect(resolveVersionFromMasterCopy(address)).toBe("V1_3_0");
  });

  it("returns undefined for an unknown address", () => {
    expect(resolveVersionFromMasterCopy(addr("not-a-master-copy"))).toBeUndefined();
  });
});

describe("isL1Safe", () => {
  const l1Versions = [
    "V0_0_2",
    "V0_1_0",
    "V1_0_0",
    "V1_1_0",
    "V1_1_1",
    "V1_2_0",
    "V1_3_0",
    "V1_4_1",
    "V1_5_0",
  ] as const;

  it.each(l1Versions)("returns true for non-L2 enum %s", (version) => {
    expect(isL1Safe({ version })).toBe(true);
  });

  const l2Versions = ["V1_3_0_L2", "V1_4_1_L2", "V1_5_0_L2"] as const;

  it.each(l2Versions)("returns false for L2-suffixed enum %s", (version) => {
    expect(isL1Safe({ version })).toBe(false);
  });

  it("returns false for UNKNOWN / null / undefined", () => {
    expect(isL1Safe({ version: "UNKNOWN" })).toBe(false);
    expect(isL1Safe({ version: null })).toBe(false);
    expect(isL1Safe({ version: undefined })).toBe(false);
  });
});

describe("decodeSetupInput", () => {
  const ownerA = addr("setup-owner-a");
  const ownerB = addr("setup-owner-b");

  function encodeV1_0_0Setup(owners: string[], threshold: number): string {
    const iface = new ethers.Interface(SETUP_ABI_V1_0_0);
    return iface.encodeFunctionData("setup", [
      owners,
      threshold,
      zeroAddress,
      "0x",
      zeroAddress,
      0,
      zeroAddress,
    ]);
  }
  function encodeV1_1_1Setup(
    owners: string[],
    threshold: number,
    fallbackHandler: string = zeroAddress,
  ): string {
    const iface = new ethers.Interface(SETUP_ABI_V1_1_1);
    return iface.encodeFunctionData("setup", [
      owners,
      threshold,
      zeroAddress,
      "0x",
      fallbackHandler, // the extra param vs 1.0.0
      zeroAddress,
      0,
      zeroAddress,
    ]);
  }

  it("returns {owners: [], threshold: 0} for empty input", () => {
    expect(decodeSetupInput("", "V1_3_0")).toEqual({ owners: [], threshold: 0, fallbackHandler: null });
  });

  it("returns {owners: [], threshold: 0} for input shorter than selector", () => {
    expect(decodeSetupInput("0x12", "V1_3_0")).toEqual({ owners: [], threshold: 0, fallbackHandler: null });
  });

  it("returns {owners: [], threshold: 0} when selector doesn't match the version's setup", () => {
    // execTransaction selector — wrong function entirely
    const iface = new ethers.Interface(EXEC_TRANSACTION_ABI);
    const wrong = iface.encodeFunctionData("execTransaction", [
      zeroAddress, 0, "0x", 0, 0, 0, 0, zeroAddress, zeroAddress, "0x",
    ]);
    expect(decodeSetupInput(wrong, "V1_3_0")).toEqual({ owners: [], threshold: 0, fallbackHandler: null });
  });

  it("decodes a v1.0.0-shaped setup correctly (no fallbackHandler in this ABI)", () => {
    const input = encodeV1_0_0Setup([ownerA, ownerB], 2);
    const result = decodeSetupInput(input, "V1_0_0");
    expect(result.owners.map((o) => o.toLowerCase())).toEqual([ownerA, ownerB]);
    expect(result.threshold).toBe(2);
    // v1.0.0 ABI has no fallbackHandler param — must be null.
    expect(result.fallbackHandler).toBeNull();
  });

  it("decodes a v1.1.1+ setup and returns the fallbackHandler", () => {
    const fallback = addr("fallback-handler-a");
    const input = encodeV1_1_1Setup([ownerA], 1, fallback);
    const result = decodeSetupInput(input, "V1_3_0");
    expect(result.owners.map((o) => o.toLowerCase())).toEqual([ownerA]);
    expect(result.threshold).toBe(1);
    expect(result.fallbackHandler?.toLowerCase()).toBe(fallback);
  });

  it("v1.1.1+ ABI with zero-address fallbackHandler still returns the zero address (not null)", () => {
    const input = encodeV1_1_1Setup([ownerA], 1, zeroAddress);
    const result = decodeSetupInput(input, "V1_3_0");
    expect(result.fallbackHandler?.toLowerCase()).toBe(zeroAddress);
  });

  it("UNKNOWN version falls back to v1.1.1 ABI and still decodes fallbackHandler", () => {
    const fallback = addr("unknown-fallback");
    const input = encodeV1_1_1Setup([ownerA, ownerB], 1, fallback);
    const result = decodeSetupInput(input, "UNKNOWN" as SafeVersion);
    expect(result.owners.map((o) => o.toLowerCase())).toEqual([ownerA, ownerB]);
    expect(result.threshold).toBe(1);
    expect(result.fallbackHandler?.toLowerCase()).toBe(fallback);
  });

  it("returns {owners: [], threshold: 0} on decode failure (right selector, malformed body)", () => {
    const iface = new ethers.Interface(SETUP_ABI_V1_1_1);
    const selector = iface.getFunction("setup")!.selector;
    // selector + garbage that won't decode as the setup tuple
    const malformed = selector + "deadbeef";
    expect(decodeSetupInput(malformed, "V1_3_0")).toEqual({ owners: [], threshold: 0, fallbackHandler: null });
  });
});

describe("decodeExecTransaction", () => {
  const safeFrom = addr("exec-tx-from");
  const targetTo = addr("exec-tx-to");

  function encodeExec(): `0x${string}` {
    return encodeFunctionData({
      abi: [
        {
          name: "execTransaction",
          type: "function",
          stateMutability: "payable",
          inputs: [
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" },
            { name: "operation", type: "uint8" },
            { name: "safeTxGas", type: "uint256" },
            { name: "baseGas", type: "uint256" },
            { name: "gasPrice", type: "uint256" },
            { name: "gasToken", type: "address" },
            { name: "refundReceiver", type: "address" },
            { name: "signatures", type: "bytes" },
          ],
          outputs: [{ name: "success", type: "bool" }],
        },
      ],
      functionName: "execTransaction",
      args: [
        targetTo,
        123n,
        "0xabcd",
        1,
        100n,
        200n,
        300n,
        zeroAddress as `0x${string}`,
        zeroAddress as `0x${string}`,
        "0xbeef",
      ],
    });
  }

  it("returns undefined for short input", () => {
    expect(decodeExecTransaction("0x12", safeFrom)).toBeUndefined();
    expect(decodeExecTransaction("", safeFrom)).toBeUndefined();
  });

  it("returns undefined for non-matching selector", () => {
    expect(decodeExecTransaction("0xdeadbeef" + "00".repeat(32), safeFrom)).toBeUndefined();
  });

  it("decodes a known-good execTransaction calldata", () => {
    const decoded = decodeExecTransaction(encodeExec(), safeFrom);
    expect(decoded).toBeDefined();
    expect(decoded!.to.toLowerCase()).toBe(targetTo);
    expect(decoded!.value).toBe(123n);
    expect(decoded!.data).toBe("0xabcd");
    expect(decoded!.operation).toBe(1);
    expect(decoded!.safeTxGas).toBe(100n);
    expect(decoded!.baseGas).toBe(200n);
    expect(decoded!.gasPrice).toBe(300n);
    expect(decoded!.signatures).toBe("0xbeef");
  });

  it("sets msgSender from the `from` parameter, not from calldata", () => {
    const decoded = decodeExecTransaction(encodeExec(), safeFrom);
    expect(decoded!.msgSender).toBe(safeFrom);
  });
});

describe("decodeCreateProxyWithNonceInitializer", () => {
  const factoryAbi = [
    "function createProxyWithNonce(address _mastercopy, bytes memory initializer, uint256 saltNonce) returns (address proxy)",
  ];
  const factoryIface = new ethers.Interface(factoryAbi);

  function encodeFactoryCall(initializer: string, saltNonce: bigint = 0n): string {
    return factoryIface.encodeFunctionData("createProxyWithNonce", [
      MASTER_COPIES.V1_4_1_L2,
      initializer,
      saltNonce,
    ]);
  }

  it("decodes a real createProxyWithNonce calldata and returns the initializer bytes", () => {
    // A non-trivial initializer — exact bytes don't matter as long as the
    // decoder returns them verbatim.
    const initializer = "0xb63e800d" + "00".repeat(32 * 8);
    const calldata = encodeFactoryCall(initializer, 42n);
    expect(decodeCreateProxyWithNonceInitializer(calldata)).toBe(initializer);
  });

  it("returns undefined for empty/missing input", () => {
    expect(decodeCreateProxyWithNonceInitializer(undefined)).toBeUndefined();
    expect(decodeCreateProxyWithNonceInitializer("")).toBeUndefined();
    expect(decodeCreateProxyWithNonceInitializer("0x")).toBeUndefined();
  });

  it("returns undefined for non-decodable wrapper selectors (handleOps, Gelato, etc.)", () => {
    // Some other 4-byte selector with otherwise-plausible ABI-encoded data —
    // e.g. an ERC-4337 EntryPoint handleOps call. Only MultiSend is peeled
    // (see below); other wrappers are still TODO and must land null.
    const handleOpsSelector = "0x765e827f"; // EntryPoint v0.6 handleOps
    const calldata = handleOpsSelector + "00".repeat(64);
    expect(decodeCreateProxyWithNonceInitializer(calldata)).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // MultiSend wrap — one-layer peel matching Safe Transaction Service's
  // `_decode_creation_data` (`safe_service.py`). Each sub-tx is packed as
  // `operation(1B) + to(20B) + value(32B) + dataLength(32B) + data`.
  // -------------------------------------------------------------------------
  const multiSendIface = new ethers.Interface([
    "function multiSend(bytes memory transactions)",
  ]);

  /** Pack one sub-tx into the MultiSend transactions blob format. */
  function packMultiSendSubTx(args: {
    operation?: number; // 0 CALL, 1 DELEGATECALL — value irrelevant for the decoder
    to: string;
    value?: bigint;
    data: string;
  }): string {
    const op = (args.operation ?? 0).toString(16).padStart(2, "0");
    const to = args.to.replace(/^0x/, "").toLowerCase().padStart(40, "0");
    const value = (args.value ?? 0n).toString(16).padStart(64, "0");
    const dataHex = args.data.replace(/^0x/, "");
    const dataLen = Math.floor(dataHex.length / 2)
      .toString(16)
      .padStart(64, "0");
    return op + to + value + dataLen + dataHex;
  }

  function encodeMultiSend(packedSubTxs: string): string {
    return multiSendIface.encodeFunctionData("multiSend", ["0x" + packedSubTxs]);
  }

  it("peels one MultiSend layer to find the factory call's initializer", () => {
    const initializer = "0xb63e800d" + "11".repeat(32 * 6);
    const factoryCalldata = encodeFactoryCall(initializer, 7n);
    const packed = packMultiSendSubTx({
      to: "0xfff100000000000000000000000000000000fff1", // factory addr — value not checked
      data: factoryCalldata,
    });
    expect(decodeCreateProxyWithNonceInitializer(encodeMultiSend(packed))).toBe(
      initializer,
    );
  });

  it("scans past unrelated sub-txs and finds the factory call further in the bundle", () => {
    const initializer = "0xb63e800d" + "22".repeat(32 * 4);
    const unrelated1 = packMultiSendSubTx({
      to: "0x" + "ab".repeat(20),
      data: "0xdeadbeef" + "00".repeat(32),
    });
    const unrelated2 = packMultiSendSubTx({
      to: "0x" + "cd".repeat(20),
      data: "0x12345678",
    });
    const factory = packMultiSendSubTx({
      to: "0x" + "ff".repeat(20),
      data: encodeFactoryCall(initializer, 99n),
    });
    expect(
      decodeCreateProxyWithNonceInitializer(
        encodeMultiSend(unrelated1 + unrelated2 + factory),
      ),
    ).toBe(initializer);
  });

  it("returns undefined for a MultiSend with no factory sub-tx", () => {
    const sub = packMultiSendSubTx({
      to: "0x" + "ab".repeat(20),
      data: "0xdeadbeefdeadbeef",
    });
    expect(
      decodeCreateProxyWithNonceInitializer(encodeMultiSend(sub)),
    ).toBeUndefined();
  });

  it("returns undefined for a malformed MultiSend transactions blob", () => {
    // Looks like multiSend selector, but the transactions blob is too short
    // to be a valid sub-tx header. The decoder must bail without throwing.
    const truncated = multiSendIface.encodeFunctionData("multiSend", ["0xdeadbeef"]);
    expect(decodeCreateProxyWithNonceInitializer(truncated)).toBeUndefined();
  });

  it("unwraps nested MultiSend (MultiSend inside MultiSend) via recursion", () => {
    const initializer = "0xb63e800d" + "33".repeat(32 * 5);
    const innerFactory = packMultiSendSubTx({
      to: "0x" + "ff".repeat(20),
      data: encodeFactoryCall(initializer, 1n),
    });
    const innerMultiSend = encodeMultiSend(innerFactory);
    const outerSub = packMultiSendSubTx({
      to: "0x" + "ee".repeat(20),
      data: innerMultiSend,
    });
    expect(decodeCreateProxyWithNonceInitializer(encodeMultiSend(outerSub))).toBe(
      initializer,
    );
  });

  it("returns undefined when initializer is the empty bytes sentinel (`0x`)", () => {
    // A deploy that skipped setup() — Safe TX Service reports setupData=null
    // for these too; matching that lets the integration comparator skip them.
    const calldata = encodeFactoryCall("0x", 0n);
    expect(decodeCreateProxyWithNonceInitializer(calldata)).toBeUndefined();
  });

  it("returns undefined for malformed calldata that has the right selector but bad payload", () => {
    // Right selector, truncated payload.
    const malformed = "0x1688f0b9" + "00".repeat(20);
    expect(decodeCreateProxyWithNonceInitializer(malformed)).toBeUndefined();
  });

  it("is case-insensitive on the selector hex", () => {
    const initializer = "0xdeadbeef";
    const calldata = encodeFactoryCall(initializer, 1n);
    // Upper-case the whole thing.
    expect(
      decodeCreateProxyWithNonceInitializer(calldata.toUpperCase().replace("0X", "0x")),
    ).toBe(initializer);
  });
});

describe("findCreatorFromTraceList", () => {
  // Helpers to keep test cases declarative — Parity/OpenEthereum trace shape.
  const safe = "0xaaaa00000000000000000000000000000000aaaa";
  const factory = "0xfff100000000000000000000000000000000fff1";
  const userEOA = "0x1111111111111111111111111111111111111111";
  const senderCreator = "0xefc2c1444ebcc4db75e7613d20c6a62ff67a167c";
  const entryPoint = "0x0000000071727de22e5e9d8baf0edac6f37da032";

  function callTrace(
    from: string,
    to: string,
    traceAddress: number[],
  ): TraceTransactionItem {
    return {
      action: { from, to, callType: "call" },
      traceAddress,
      type: "call",
    };
  }

  function createTrace(
    from: string,
    createdAddress: string,
    traceAddress: number[],
  ): TraceTransactionItem {
    return {
      action: { from },
      result: { address: createdAddress },
      traceAddress,
      type: "create",
    };
  }

  it("direct factory call: parent of CREATE is the top-level tx, returns user EOA", async () => {
    // Tx: user → factory.createProxyWithNonce → CREATE2 safe
    // CREATE traceAddress = [0]; parent traceAddress = [] (top-level call).
    const traces: TraceTransactionItem[] = [
      callTrace(userEOA, factory, []), // top-level call to factory
      createTrace(factory, safe, [0]), // factory's CREATE
    ];
    expect(findCreatorFromTraceList(traces, safe)).toBe(userEOA);
  });

  it("4337 EntryPoint deployment: parent of CREATE is SenderCreator, matches Safe TX Service `creator`", async () => {
    // Tx: bundler → EntryPoint → SenderCreator → factory.createProxyWithNonce → CREATE2 safe
    // CREATE traceAddress = [0, 0, 0]; parent = [0, 0] (the SenderCreator→factory call).
    const bundler = "0x4337999999999999999999999999999999994337";
    const traces: TraceTransactionItem[] = [
      callTrace(bundler, entryPoint, []), // top-level: bundler → EntryPoint
      callTrace(entryPoint, senderCreator, [0]), // EntryPoint → SenderCreator
      callTrace(senderCreator, factory, [0, 0]), // SenderCreator → factory
      createTrace(factory, safe, [0, 0, 0]), // factory's CREATE
    ];
    expect(findCreatorFromTraceList(traces, safe)).toBe(senderCreator);
  });

  it("CREATE2 type is treated identically to CREATE", async () => {
    const traces: TraceTransactionItem[] = [
      callTrace(userEOA, factory, []),
      { ...createTrace(factory, safe, [0]), type: "create2" },
    ];
    expect(findCreatorFromTraceList(traces, safe)).toBe(userEOA);
  });

  it("returns null when no CREATE frame for the safe is present (defensive: caller falls back to tx.from)", async () => {
    const traces: TraceTransactionItem[] = [
      callTrace(userEOA, factory, []),
      createTrace(factory, "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", [0]),
    ];
    expect(findCreatorFromTraceList(traces, safe)).toBeNull();
  });

  it("returns null when CREATE is the root frame (no parent — caller falls back to tx.from)", async () => {
    // Unusual but possible: tx data == raw contract init code, CREATE is the
    // top-level frame. No parent to read `from` from.
    const traces: TraceTransactionItem[] = [
      createTrace(userEOA, safe, []),
    ];
    expect(findCreatorFromTraceList(traces, safe)).toBeNull();
  });

  it("multiple CREATEs in same tx (MultiSend deploying many Safes): returns the parent of the matching one", async () => {
    const otherSafe = "0xbbbb00000000000000000000000000000000bbbb";
    const multiSend = "0xcccc00000000000000000000000000000000cccc";
    const traces: TraceTransactionItem[] = [
      callTrace(userEOA, multiSend, []),
      callTrace(multiSend, factory, [0]),
      createTrace(factory, otherSafe, [0, 0]),
      callTrace(multiSend, factory, [1]),
      createTrace(factory, safe, [1, 0]), // the one we want
    ];
    expect(findCreatorFromTraceList(traces, safe)).toBe(multiSend);
  });

  it("address comparison is case-insensitive", async () => {
    const traces: TraceTransactionItem[] = [
      callTrace(userEOA, factory, []),
      createTrace(factory, safe.toUpperCase().replace("0X", "0x"), [0]),
    ];
    expect(findCreatorFromTraceList(traces, safe)).toBe(userEOA);
  });
});
