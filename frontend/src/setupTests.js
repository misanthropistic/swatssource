// Runs before every test file (CRA wires this up as jest `setupFilesAfterEnv`).
// jsdom in Jest 27 does not implement TextEncoder/TextDecoder, which
// react-router v7 touches at import time.
const { TextEncoder, TextDecoder } = require("util");

if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = TextDecoder;
}
