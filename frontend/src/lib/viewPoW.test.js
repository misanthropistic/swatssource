// The client solver and the server verifier MUST agree byte-for-byte, otherwise
// no real view can ever be counted (or a fake one always can). These tests
// cross-check the pure-JS sha256 against Node's native implementation.
import crypto from "crypto";
import { sha256Hex, leadingZeroBits, proofHash, solveProof, solveProofAsync } from "./viewPoW";

const nodeSha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");

it("matches the standard sha256 vectors", () => {
  expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

it("agrees with Node crypto for tricky inputs (unicode, emoji, long)", () => {
  const samples = [
    "seed:0",
    "café — ünïcode ✓",
    "emoji 🚀🌧️ test",
    "x".repeat(1000),
    "",
    "a",
  ];
  for (const s of samples) expect(sha256Hex(s)).toBe(nodeSha(s));
});

it("counts leading zero bits the same way the server does", () => {
  expect(leadingZeroBits("ffffffff")).toBe(0);
  expect(leadingZeroBits("7fffffff")).toBe(1);
  expect(leadingZeroBits("0fffffff")).toBe(4);
  expect(leadingZeroBits("00ffffff")).toBe(8);
  expect(leadingZeroBits("00000000")).toBe(32);
});

it("solves a proof that independently verifies", () => {
  const seed = "deadbeef";
  const nonce = solveProof(seed, 10);
  expect(leadingZeroBits(proofHash(seed, nonce))).toBeGreaterThanOrEqual(10);
  // Re-verify the same way the server will.
  expect(leadingZeroBits(nodeSha(`${seed}:${nonce}`))).toBeGreaterThanOrEqual(10);
});

it("solveProofAsync returns an equivalent, valid nonce", async () => {
  const seed = "async-seed";
  const nonce = await solveProofAsync(seed, 9, { batch: 3 });
  expect(leadingZeroBits(nodeSha(`${seed}:${nonce}`))).toBeGreaterThanOrEqual(9);
});
