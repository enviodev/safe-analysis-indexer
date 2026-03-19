import { decodeFunctionData, parseAbi } from 'viem';

const SETUP_V1_1_1 = parseAbi([
  'function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)',
]);

const SETUP_V1_0_0 = parseAbi([
  'function setup(address[] _owners, uint256 _threshold, address to, bytes data, address paymentToken, uint256 payment, address paymentReceiver)',
]);

export type SetupDataDecoded = {
  method: 'setup';
  parameters: Array<{
    name: string;
    type: string;
    value: string | string[];
  }>;
};

function parametersFromArgs(
  args: readonly unknown[],
  withFallback: boolean,
): SetupDataDecoded['parameters'] {
  const owners = args[0] as string[];
  const threshold = args[1] as bigint;
  const to = args[2] as string;
  const data = args[3] as string;

  if (withFallback) {
    const fallbackHandler = args[4] as string;
    const paymentToken = args[5] as string;
    const payment = args[6] as bigint;
    const paymentReceiver = args[7] as string;
    return [
      { name: '_owners', type: 'address[]', value: owners },
      { name: '_threshold', type: 'uint256', value: String(threshold) },
      { name: 'to', type: 'address', value: to },
      { name: 'data', type: 'bytes', value: data },
      { name: 'fallbackHandler', type: 'address', value: fallbackHandler },
      { name: 'paymentToken', type: 'address', value: paymentToken },
      { name: 'payment', type: 'uint256', value: String(payment) },
      { name: 'paymentReceiver', type: 'address', value: paymentReceiver },
    ];
  }

  const paymentToken = args[4] as string;
  const payment = args[5] as bigint;
  const paymentReceiver = args[6] as string;
  return [
    { name: '_owners', type: 'address[]', value: owners },
    { name: '_threshold', type: 'uint256', value: String(threshold) },
    { name: 'to', type: 'address', value: to },
    { name: 'data', type: 'bytes', value: data },
    { name: 'paymentToken', type: 'address', value: paymentToken },
    { name: 'payment', type: 'uint256', value: String(payment) },
    { name: 'paymentReceiver', type: 'address', value: paymentReceiver },
  ];
}

/** Decode Safe `setup` calldata from initializer bytes; returns null if not decodable. */
export function decodeSetupInitializer(
  initializer: string | null | undefined,
): SetupDataDecoded | null {
  if (!initializer || initializer === '0x' || initializer.length < 10) {
    return null;
  }

  try {
    const decoded = decodeFunctionData({
      abi: SETUP_V1_1_1,
      data: initializer as `0x${string}`,
    });
    if (decoded.functionName !== 'setup') return null;
    return {
      method: 'setup',
      parameters: parametersFromArgs(decoded.args, true),
    };
  } catch {
    try {
      const decoded = decodeFunctionData({
        abi: SETUP_V1_0_0,
        data: initializer as `0x${string}`,
      });
      if (decoded.functionName !== 'setup') return null;
      return {
        method: 'setup',
        parameters: parametersFromArgs(decoded.args, false),
      };
    } catch {
      return null;
    }
  }
}
