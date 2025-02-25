import assert from "assert";
import { 
  TestHelpers,
  SafeProxyFactory_ProxyCreation
} from "generated";
const { MockDb, SafeProxyFactory } = TestHelpers;

describe("SafeProxyFactory contract ProxyCreation event tests", () => {
  // Create mock db
  const mockDb = MockDb.createMockDb();

  // Creating mock for SafeProxyFactory contract ProxyCreation event
  const event = SafeProxyFactory.ProxyCreation.createMockEvent({/* It mocks event fields with default values. You can overwrite them if you need */});

  it("SafeProxyFactory_ProxyCreation is created correctly", async () => {
    // Processing the event
    const mockDbUpdated = await SafeProxyFactory.ProxyCreation.processEvent({
      event,
      mockDb,
    });

    // Getting the actual entity from the mock database
    let actualSafeProxyFactoryProxyCreation = mockDbUpdated.entities.SafeProxyFactory_ProxyCreation.get(
      `${event.chainId}_${event.block.number}_${event.logIndex}`
    );

    // Creating the expected entity
    const expectedSafeProxyFactoryProxyCreation: SafeProxyFactory_ProxyCreation = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      proxy: event.params.proxy,
      singleton: event.params.singleton,
    };
    // Asserting that the entity in the mock database is the same as the expected entity
    assert.deepEqual(actualSafeProxyFactoryProxyCreation, expectedSafeProxyFactoryProxyCreation, "Actual SafeProxyFactoryProxyCreation should be the same as the expectedSafeProxyFactoryProxyCreation");
  });
});
