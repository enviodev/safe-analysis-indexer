import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { encodeFunctionData, zeroAddress } from "viem";
import {
  resolveVersionFromMasterCopy,
  isL1Safe,
  MASTER_COPY_TO_VERSION,
  L1_MASTER_COPIES,
  SETUP_ABI_V1_0_0,
  SETUP_ABI_V1_1_1,
  EXEC_TRANSACTION_ABI,
} from "../consts";
import type { SafeVersion } from "../consts";
import { decodeSetupInput, decodeExecTransaction } from "../hypersync";
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
  const pre1_3_0Versions = ["V0_0_2", "V0_1_0", "V1_0_0", "V1_1_0", "V1_1_1", "V1_2_0"] as const;

  it.each(pre1_3_0Versions)(
    "returns true for pre-1.3.0 version %s regardless of masterCopy",
    (version) => {
      expect(isL1Safe({ version, masterCopy: undefined })).toBe(true);
      expect(isL1Safe({ version, masterCopy: MASTER_COPIES.V1_3_0_L2 })).toBe(true);
    },
  );

  it("returns true for V1_3_0 with an L1 masterCopy", () => {
    expect(isL1Safe({ version: "V1_3_0", masterCopy: MASTER_COPIES.V1_3_0_L1 })).toBe(true);
  });

  it("returns false for V1_3_0 with an L2 masterCopy", () => {
    expect(isL1Safe({ version: "V1_3_0", masterCopy: MASTER_COPIES.V1_3_0_L2 })).toBe(false);
  });

  it("returns false for V1_3_0+ with no masterCopy", () => {
    expect(isL1Safe({ version: "V1_3_0", masterCopy: undefined })).toBe(false);
    expect(isL1Safe({ version: "V1_4_1", masterCopy: undefined })).toBe(false);
  });

  it("L1_MASTER_COPIES covers every L1 entry the resolver knows about", () => {
    // Sanity: every entry in L1_MASTER_COPIES is also in MASTER_COPY_TO_VERSION
    for (const l1 of L1_MASTER_COPIES) {
      expect(MASTER_COPY_TO_VERSION[l1], `L1 entry ${l1} missing from version map`).toBeDefined();
    }
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
  function encodeV1_1_1Setup(owners: string[], threshold: number): string {
    const iface = new ethers.Interface(SETUP_ABI_V1_1_1);
    return iface.encodeFunctionData("setup", [
      owners,
      threshold,
      zeroAddress,
      "0x",
      zeroAddress, // fallbackHandler — the extra param vs 1.0.0
      zeroAddress,
      0,
      zeroAddress,
    ]);
  }

  it("returns {owners: [], threshold: 0} for empty input", () => {
    expect(decodeSetupInput("", "V1_3_0")).toEqual({ owners: [], threshold: 0 });
  });

  it("returns {owners: [], threshold: 0} for input shorter than selector", () => {
    expect(decodeSetupInput("0x12", "V1_3_0")).toEqual({ owners: [], threshold: 0 });
  });

  it("returns {owners: [], threshold: 0} when selector doesn't match the version's setup", () => {
    // execTransaction selector — wrong function entirely
    const iface = new ethers.Interface(EXEC_TRANSACTION_ABI);
    const wrong = iface.encodeFunctionData("execTransaction", [
      zeroAddress, 0, "0x", 0, 0, 0, 0, zeroAddress, zeroAddress, "0x",
    ]);
    expect(decodeSetupInput(wrong, "V1_3_0")).toEqual({ owners: [], threshold: 0 });
  });

  it("decodes a v1.0.0-shaped setup correctly", () => {
    const input = encodeV1_0_0Setup([ownerA, ownerB], 2);
    const result = decodeSetupInput(input, "V1_0_0");
    expect(result.owners.map((o) => o.toLowerCase())).toEqual([ownerA, ownerB]);
    expect(result.threshold).toBe(2);
  });

  it("decodes a v1.1.1+ setup correctly", () => {
    const input = encodeV1_1_1Setup([ownerA], 1);
    const result = decodeSetupInput(input, "V1_3_0");
    expect(result.owners.map((o) => o.toLowerCase())).toEqual([ownerA]);
    expect(result.threshold).toBe(1);
  });

  it("UNKNOWN version falls back to v1.1.1 ABI", () => {
    const input = encodeV1_1_1Setup([ownerA, ownerB], 1);
    const result = decodeSetupInput(input, "UNKNOWN" as SafeVersion);
    expect(result.owners.map((o) => o.toLowerCase())).toEqual([ownerA, ownerB]);
    expect(result.threshold).toBe(1);
  });

  it("returns {owners: [], threshold: 0} on decode failure (right selector, malformed body)", () => {
    const iface = new ethers.Interface(SETUP_ABI_V1_1_1);
    const selector = iface.getFunction("setup")!.selector;
    // selector + garbage that won't decode as the setup tuple
    const malformed = selector + "deadbeef";
    expect(decodeSetupInput(malformed, "V1_3_0")).toEqual({ owners: [], threshold: 0 });
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
