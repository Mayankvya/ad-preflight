// Downloads the two third-party runtime files from their official npm releases
// into vendor/. They are not committed: GitHub's secret scanner mistakes the
// class name "Mistral3ForConditionalGeneration" in transformers.min.js for a
// Mistral API key. npm checks each package's published integrity hash.
import { execFileSync, execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PACKAGES = [
  { spec: '@huggingface/transformers@4.3.0', files: { 'dist/transformers.min.js': 'vendor/transformers.min.js' } },
  {
    spec: 'onnxruntime-web@1.31.0-dev.20260914-8d85527a0',
    files: {
      'dist/ort-wasm-simd-threaded.asyncify.mjs': 'vendor/ort/ort-wasm-simd-threaded.asyncify.mjs',
      'dist/ort-wasm-simd-threaded.asyncify.wasm': 'vendor/ort/ort-wasm-simd-threaded.asyncify.wasm',
    },
  },
];

const tmp = mkdtempSync(join(tmpdir(), 'ad-preflight-vendor-'));
try {
  mkdirSync(join(ROOT, 'vendor', 'ort'), { recursive: true });
  for (const { spec, files } of PACKAGES) {
    // Fixed package specs only, run in the temp dir (npm is a .cmd shim on Windows).
    const tgz = execSync(`npm pack ${spec} --silent`, { cwd: tmp, encoding: 'utf8' }).trim().split('\n').at(-1);
    const name = tgz.replace(/\.tgz$/, '');
    const dir = join(tmp, name);
    mkdirSync(dir, { recursive: true });
    // Relative paths: GNU tar (Git Bash) reads "C:\..." as a remote host.
    execFileSync('tar', ['-xzf', tgz, '-C', name], { cwd: tmp });
    for (const [from, to] of Object.entries(files)) {
      copyFileSync(join(dir, 'package', from), join(ROOT, to));
      console.log(`${spec}: ${from} -> ${to}`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
