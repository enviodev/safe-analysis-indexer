import {  
  SafeProxyFactoryL2V4,
  GnosisSafeL2Factory,
  GnosisSafeL2FactoryOld,
  Safe,
} from "generated";

// SafeProxyFactoryL2V4.ProxyCreation.contractRegister(
//    ({ event, context }) => {
//     context.addGnosisSafeL2(event.params.proxy);
//   },
//   { wildcard: true }
// );

SafeProxyFactoryL2V4.ProxyCreation.handler(
  async ({ event, context }) => {
    const entity: Safe = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    proxy: event.params.proxy,
    singleton: event.params.singleton,
    chainId: event.chainId,
    version: 4,
  };

  context.Safe.set(entity);
  },
  { wildcard: true }
);

// GnosisSafeL2Factory.ProxyCreation.contractRegister(
//   async ({ event, context }) => {
//     context.addGnosisSafeL2(event.params.proxy);
//   }
// );

GnosisSafeL2Factory.ProxyCreation.handler(
  async ({ event, context }) => {
      const entity: Safe = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    proxy: event.params.proxy,
    singleton: event.params.singleton,
    chainId: event.chainId,
    version: 3
  };

  context.Safe.set(entity);
  },
  { wildcard: true }
);

// GnosisSafeL2FactoryOld.ProxyCreation.contractRegister(
//   async ({ event, context }) => {
//     context.addGnosisSafeL2(event.params.proxy);
//   }
// );

GnosisSafeL2FactoryOld.ProxyCreation.handler(
  async ({ event, context }) => {
  const entity: Safe = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    proxy: event.params.proxy,
    singleton: "factory-old",
    chainId: event.chainId,
    version: 2
  };

  context.Safe.set(entity);
  },
  { wildcard: true }
);
