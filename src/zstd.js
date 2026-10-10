import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import zlib from 'node:zlib';

const execFileP = promisify(execFile);
const ZSTD_BINS = ['zstd', '/opt/homebrew/bin/zstd', '/usr/local/bin/zstd', '/usr/bin/zstd'];
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** Decompress a complete zstd stream, including concatenated frames. */
export async function decompressZstd(path, { bins = ZSTD_BINS } = {}) {
  for (const bin of bins) {
    try {
      const { stdout } = await execFileP(bin, ['-dc', path], {
        encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024,
      });
      return stdout;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  if (typeof zlib.zstdDecompressSync === 'function') {
    const buf = await readFile(path);
    // Node's built-in decoder currently stops after the first frame. Confirm any candidate
    // boundary by successfully decoding the prefix so payload bytes resembling magic do not
    // create a false multi-frame diagnosis.
    let multi = false;
    let idx = buf.indexOf(ZSTD_MAGIC, 1);
    while (idx !== -1) {
      try {
        zlib.zstdDecompressSync(buf.subarray(0, idx));
        multi = true;
        break;
      } catch { /* A magic-like sequence inside the frame payload is not a frame boundary. */ }
      idx = buf.indexOf(ZSTD_MAGIC, idx + 1);
    }
    if (multi) throw new Error(`${path} 含多个 zstd 帧，Node 内置实现只能解第一帧。请安装 zstd：brew install zstd`);
    return zlib.zstdDecompressSync(buf);
  }

  throw new Error('zstd 不可用：PATH 与常见安装路径下均无 zstd，请执行 brew install zstd');
}
