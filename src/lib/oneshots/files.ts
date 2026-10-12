// Path confinement and file checks for untrusted run directories. A path
// from a manifest or a demo must resolve to a
// regular file inside its run directory, with no symlink anywhere on the way.
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { RunError } from './manifest.ts';

const isInside = (root: string, p: string) => p.startsWith(root + path.sep);

export const isRemote = (ref: string) => /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//');

// Returns the absolute path of `rel` (relative to `fromDir`, itself inside
// `runDir`), or throws a RunError naming the run.
export function confinedFile(runDir: string, rel: string, slug: string, what: string, fromDir = runDir): string {
  if (isRemote(rel)) throw new RunError(slug, `${what} "${rel}" is a URL; only files in the run directory are allowed`);
  if (path.isAbsolute(rel)) throw new RunError(slug, `${what} "${rel}" is an absolute path`);
  const root = realpathSync(runDir);
  const abs = path.resolve(fromDir === runDir ? root : fromDir, rel);
  if (!isInside(root, abs)) throw new RunError(slug, `${what} "${rel}" points outside the run directory`);
  let st;
  try {
    st = lstatSync(abs);
  } catch {
    throw new RunError(slug, `${what} "${rel}" does not exist`);
  }
  if (st.isSymbolicLink()) throw new RunError(slug, `${what} "${rel}" is a symlink`);
  if (!st.isFile()) throw new RunError(slug, `${what} "${rel}" is not a regular file`);
  if (realpathSync(abs) !== abs) throw new RunError(slug, `${what} "${rel}" passes through a symlink`);
  return abs;
}

const MAGIC: Record<string, (b: Buffer) => boolean> = {
  webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
};

export const IMAGE_EXTENSIONS = Object.keys(MAGIC);
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Reads an image whose extension and magic bytes agree, or throws.
export function readImage(abs: string, slug: string, what: string): Buffer {
  const ext = path.extname(abs).slice(1).toLowerCase();
  const check = MAGIC[ext];
  if (!check) throw new RunError(slug, `${what} "${path.basename(abs)}" is not an image (allowed: ${IMAGE_EXTENSIONS.join(', ')})`);
  const buf = readFileSync(abs);
  if (buf.length > MAX_IMAGE_BYTES) throw new RunError(slug, `${what} "${path.basename(abs)}" is larger than 2 MiB`);
  if (!check(buf)) throw new RunError(slug, `${what} "${path.basename(abs)}" is not a valid ${ext} file`);
  return buf;
}
