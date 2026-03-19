/**
 * Map Envio Safe version enum to Safe Transaction Service display string (e.g. "1.3.0+L2").
 */
const VERSION_TO_DISPLAY: Record<string, string> = {
  V0_0_2: '0.0.2',
  V0_1_0: '0.1.0',
  V1_0_0: '1.0.0',
  V1_1_0: '1.1.0',
  V1_1_1: '1.1.1',
  V1_2_0: '1.2.0',
  V1_3_0: '1.3.0', // L1/L2 decided by isL2
  V1_4_1: '1.4.1',
  V1_5_0: '1.5.0',
  UNKNOWN: 'unknown',
};

const L2_MASTER_COPIES = new Set([
  '0x3e5c63644e683549055b9be8653de26e0b4cd36e',
  '0x69f4d1788e39c87893c980c06edf4b7f686e2938',
  '0xfb1bffc9d739b8d520daf37df666da4c687191ea',
  '0x29fcb43b46531bca003ddc8fcb67ffe91900c762',
  '0xedd160febbd92e350d4d398fb636302fccd67c7e',
]);

export function safeVersionToDisplay(
  version: string,
  masterCopy?: string | null,
): string {
  const base = VERSION_TO_DISPLAY[version] ?? version;
  if (
    base === 'unknown' ||
    base === '1.0.0' ||
    base === '1.1.0' ||
    base === '1.1.1' ||
    base === '1.2.0'
  ) {
    return base;
  }
  // 1.3.0+ can be L2
  const isL2 = masterCopy && L2_MASTER_COPIES.has(masterCopy.toLowerCase());
  return isL2 ? `${base}+L2` : base;
}
