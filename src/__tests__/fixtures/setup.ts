// Seed the env that the in-worker hypersync shim looks for. Setting it here in
// the main thread is enough because envio's TestIndexer worker inherits
// `process.env` (see envio's TestIndexer.res.mjs worker spawn).
process.env.ENVIO_TEST_MODE = "1";

// Stub out the DRPC key in CI so `isRpcConfigured(chainId)` returns true
// for chains mapped in DRPC_NETWORKS. Locally devs may already have a real
// key in `.env`; we never want to overwrite that, so only set when unset.
// The test-mode short-circuit at the top of each RPC effect handler means
// no real DRPC request ever leaves the process — the value just needs to
// be truthy.
if (!process.env.ENVIO_DRPC_API_KEY) {
  process.env.ENVIO_DRPC_API_KEY = "test-mode-stub-not-a-real-key";
}
