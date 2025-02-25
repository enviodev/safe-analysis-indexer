/*
 * Please refer to https://docs.envio.dev for a thorough guide on all Envio indexer features
 */
import {
  SafeProxyFactory,
} from "generated";

SafeProxyFactory.ProxyCreation.contractRegister(({ event, context }) => {
  context.addSafeProxy(event.params.proxy);
},  {
  preRegisterDynamicContracts: true
});

