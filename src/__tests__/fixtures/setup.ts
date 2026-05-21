// Seed the env that the in-worker hypersync shim looks for. Setting it here in
// the main thread is enough because envio's TestIndexer worker inherits
// `process.env` (see envio's TestIndexer.res.mjs worker spawn).
process.env.ENVIO_TEST_MODE = "1";
