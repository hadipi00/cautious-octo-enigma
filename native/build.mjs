// ============================================================
// ساخت simcore.wasm از simcore.wat — با wabt (wat2wasm)
// خروجی: ../src/wasm/simcore.wasm
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import wabt from 'wabt';

const here = dirname(fileURLToPath(import.meta.url));
const wat = readFileSync(join(here, 'simcore.wat'), 'utf8');

const mod = await wabt();
const wasmBytes = mod.parseWat('simcore.wat', wat, {}).toBinary({}).buffer;
const out = join(here, '..', 'src', 'wasm', 'simcore.wasm');
writeFileSync(out, wasmBytes);
console.log(`built ${out} (${wasmBytes.length} bytes)`);

// smoke test: instantiate and call exports
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const e = instance.exports;
console.log('exports:', Object.keys(e).join(', '));
