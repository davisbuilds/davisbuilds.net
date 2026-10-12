// Shared by deploy, rollback, verify-deploy and the telemetry upload. The
// server side is private/server/deploy-shell.sh, reached as the
// dbs-deploy identity through the operator's SSH alias; the server's address
// never appears here. DAVISBUILDS_SSH_CONFIG and DAVISBUILDS_ORIGIN point the
// same scripts at the rehearsal container.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const DEPLOY_HOST = process.env.DAVISBUILDS_DEPLOY_HOST ?? 'davisbuilds-deploy';
export const PUBLIC_ORIGIN = process.env.DAVISBUILDS_ORIGIN ?? 'https://davisbuilds.net';
const SSH = ['ssh', ...(process.env.DAVISBUILDS_SSH_CONFIG ? ['-F', process.env.DAVISBUILDS_SSH_CONFIG] : []), '-o', 'BatchMode=yes'];
/** rsync's remote shell, matching remote(). */
export const RSYNC_SHELL = ['-e', SSH.join(' ')];

// The server's rrsync accepts only GNU rsync 3.x as a client. macOS ships
// openrsync as /usr/bin/rsync, which it rejects, so prefer Homebrew's.
export function rsyncBinary() {
  const candidates = [process.env.DAVISBUILDS_RSYNC, '/opt/homebrew/bin/rsync', '/usr/local/bin/rsync', 'rsync'].filter(Boolean);
  for (const bin of candidates) {
    try {
      if (/^rsync\s+version 3\./.test(execFileSync(bin, ['--version'], { encoding: 'utf8' }))) return bin;
    } catch {}
  }
  throw new Error('no GNU rsync 3.x found (macOS /usr/bin/rsync is openrsync); install it with `brew install rsync`');
}
export const MANIFEST = '.release-manifest.sha256';
export const SNAPSHOTS = '.deploy';
export const ID_RE = /^\d{8}T\d{6}Z-[0-9a-f]{7}$/;

/** One forced-command verb on `host`, with optional stdin. Throws with the server's message on refusal. */
export function sshVerb(host, words, input) {
  try {
    return execFileSync(SSH[0], [...SSH.slice(1), host, words.join(' ')], {
      encoding: 'utf8',
      ...(input === undefined ? { stdio: ['ignore', 'pipe', 'pipe'] } : { input }),
    }).trim();
  } catch (e) {
    throw new Error(`${words[0]}: ${(e.stderr?.toString().trim() || e.stdout?.toString().trim() || e.message).toString().trim()}`);
  }
}

/** One deploy-shell verb, as dbs-deploy. */
export const remote = (...words) => sshVerb(DEPLOY_HOST, words);

/**
 * Refuse, before anything changes, when the server's forced command predates
 * serve-check. Root installs that command (private/server/bootstrap.sh), so the
 * client can be newer than the server; without this, a deploy or rollback
 * would switch `current` and only then fail its served-file check. The probe
 * sends serve-check with no id: a shell that knows the verb rejects the id,
 * and one that doesn't rejects the verb.
 */
export function requireServeCheck() {
  try {
    remote('serve-check');
  } catch (e) {
    if (!/unknown command/.test(e.message)) return;
    throw new Error("the server's deploy shell predates serve-check; re-run private/server/bootstrap.sh as root (owner approval) to update it, or pass --no-http");
  }
  throw new Error('serve-check accepted no release id; the server shell is not the one in private/server/deploy-shell.sh');
}

/** Every file under `dir` (relative, sorted), refusing anything that isn't a plain file or directory. */
export function files(dir, rel = '') {
  return readdirSync(path.join(dir, rel)).sort().flatMap((name) => {
    const r = rel ? `${rel}/${name}` : name;
    const st = lstatSync(path.join(dir, r));
    if (st.isDirectory()) return files(dir, r);
    if (st.isFile()) return [r];
    throw new Error(`${r}: not a plain file (symlinks and special files can't be released)`);
  });
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** The manifest the server checks a release against: `<sha256>  <path>` per file. */
export function manifestOf(dir) {
  return files(dir).filter((f) => f !== MANIFEST).map((f) => `${sha256(readFileSync(path.join(dir, f)))}  ${f}`).join('\n') + '\n';
}

export function readManifest(file) {
  return new Map(readFileSync(file, 'utf8').trim().split('\n').map((line) => {
    const [hash, ...rest] = line.split('  ');
    return [rest.join('  '), hash];
  }));
}

/** The release `current` points at, from the server's own listing. */
export function currentRelease() {
  return remote('list').split('\n').find((l) => l.endsWith(' current'))?.split(' ')[0] ?? null;
}

// The URL that serves a release file: directory indexes by their directory,
// and each segment encoded, so a name with `#`, `?` or `%` is fetched as
// itself rather than cut short.
export function urlFor(file) {
  const encoded = file.split('/').map(encodeURIComponent).join('/');
  if (encoded === 'index.html') return `${PUBLIC_ORIGIN}/`;
  if (encoded.endsWith('/index.html')) return `${PUBLIC_ORIGIN}/${encoded.slice(0, -'index.html'.length)}`;
  return `${PUBLIC_ORIGIN}/${encoded}`;
}

/**
 * Check a release: `current` names it, the server re-hashes it against its
 * manifest, and (`served`) the server fetches every file from its own nginx
 * and compares it with the manifest. With `publicCheck`, every file
 * served at the public hostname must also match the local snapshot; the
 * proxy's bot challenge blocks that for scripted clients, so it's opt-in.
 */
export async function verifyRelease(id, { served = true, publicCheck = false, log = console.log } = {}) {
  const problems = [];
  const cur = currentRelease();
  if (cur !== id) problems.push(`current is ${cur ?? 'unset'}, expected ${id}`);
  for (const verb of served ? ['verify', 'serve-check'] : ['verify']) {
    try {
      log(remote(verb, id));
    } catch (e) {
      problems.push(e.message);
    }
  }
  if (publicCheck) {
    const local = path.join(SNAPSHOTS, id, MANIFEST);
    if (!existsSync(local)) throw new Error(`no local snapshot for ${id} (${local}), so there's nothing to compare the served files with`);
    const entries = [...readManifest(local)];
    let checked = 0;
    for (let i = 0; i < entries.length; i += 8) {
      await Promise.all(entries.slice(i, i + 8).map(async ([file, hash]) => {
        const url = urlFor(file);
        const res = await fetch(url, { headers: { 'accept-encoding': 'identity' }, signal: AbortSignal.timeout(30_000) });
        const got = sha256(Buffer.from(await res.arrayBuffer()));
        if (!res.ok || got !== hash) problems.push(`${url}: ${res.status}${res.ok ? ', content differs' : ''}`);
        checked++;
      }));
    }
    log(`served files: ${checked - problems.filter((p) => p.startsWith('http')).length} of ${checked} match`);
  }
  return problems;
}
