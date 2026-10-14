// A Cache-API-shaped store (match/put) on the Origin Private File System.
// Chrome's Cache API can refuse a single 763 MB entry ("Unexpected internal
// error"), which would mean re-downloading Gemma on every launch. OPFS is a
// plain private disk area with no per-entry limit, and Transformers.js
// accepts any object with match() and put() as its cache.

const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');

async function fileName(key) {
  const url = typeof key === 'string' ? key : key.url;
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url)));
}

// createWritable() stages a full temporary copy before committing, so a
// 763 MB file briefly needs 1.5 GB. Workers get a sync handle that writes
// straight into the file instead.
async function writeInPlace(fileHandle, body) {
  const h = await fileHandle.createSyncAccessHandle();
  try {
    h.truncate(0);
    const reader = body.getReader();
    let at = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      at += h.write(value, { at });
    }
    h.flush();
  } finally {
    h.close();
  }
}

export function createOpfsCache(getDir = () => navigator.storage.getDirectory()) {
  let dirPromise = null;
  const dir = () => (dirPromise ??= getDir());

  return {
    async match(key) {
      const name = await fileName(key);
      try {
        const file = await (await (await dir()).getFileHandle(name)).getFile();
        return new Response(file, { headers: { 'content-length': String(file.size) } });
      } catch {
        return undefined;
      }
    },

    // Write to "<name>.part" and rename only when complete, so a download
    // cut off halfway is never mistaken for a cached model.
    async put(key, response) {
      const name = await fileName(key);
      const part = await (await dir()).getFileHandle(`${name}.part`, { create: true });
      if (part.createSyncAccessHandle) await writeInPlace(part, response.body);
      else await response.body.pipeTo(await part.createWritable());
      await part.move(name);
    },
  };
}
