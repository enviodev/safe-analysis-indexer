/*
 * Please refer to https://docs.envio.dev for a thorough guide on all Envio indexer features
 */
import {
  SafeProxyFactory,
  SafeProxyFactory_ProxyCreation,
} from "generated";

SafeProxyFactory.ProxyCreation.handler(async ({ event, context }) => {
  const entity: SafeProxyFactory_ProxyCreation = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    proxy: event.params.proxy,
    singleton: event.params.singleton,
  };

  context.SafeProxyFactory_ProxyCreation.set(entity);
});
