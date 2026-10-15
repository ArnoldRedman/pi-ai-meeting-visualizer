import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
import { assetPacks } from '../assets/manifest.mjs';

const CACHE = new URL('../assets/cache/kenney/', import.meta.url);
const MAX_ARCHIVE = 64 * 1024 * 1024;

export function extractPack(pack, archive) {
  if (archive.length > MAX_ARCHIVE) throw new Error(`${pack.title} 压缩包超过 64 MiB 限制`);
  if (createHash('sha256').update(archive).digest('hex') !== pack.sha256) {
    throw new Error(`${pack.title} SHA-256 不匹配，请核对官方版本；不会使用或覆盖已有模型`);
  }
  const wanted = new Set(Object.values(pack.files));
  // 除已知文件外不解压任何条目，避免路径穿越和解压膨胀
  const files = unzipSync(archive, {
    filter: file => wanted.has(file.name) && file.originalSize <= 8 * 1024 * 1024,
  });
  for (const source of wanted) {
    if (!files[source]?.length) throw new Error(`${pack.title} 缺少所需文件：${source}`);
  }
  return files;
}

async function download(pack) {
  const response = await fetch(pack.url, { signal: AbortSignal.timeout(90000), redirect: 'error' });
  if (!response.ok) throw new Error(`${pack.title} 下载失败：HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > MAX_ARCHIVE) throw new Error('资源下载超过 64 MiB 限制');
  const parts = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_ARCHIVE) throw new Error('资源下载超过 64 MiB 限制');
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

export async function fetchAssets() {
  await mkdir(CACHE, { recursive: true });
  for (const pack of assetPacks) {
    const archivePath = new URL(`${pack.id}.zip`, CACHE);
    let archive;
    let cached = true;
    try {
      archive = await readFile(archivePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      cached = false;
      console.log(`正在下载 ${pack.title}…`);
      archive = await download(pack);
    }
    const files = extractPack(pack, archive);
    // 先完成整个包的校验再落盘；首次下载之外均可离线重建缓存
    if (!cached) await writeFile(archivePath, archive, { flag: 'wx' });
    for (const [target, source] of Object.entries(pack.files)) {
      const path = fileURLToPath(new URL(`${pack.folder}/${target}`, CACHE));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, files[source]);
    }
    console.log(`${pack.title} 已就绪：${Object.keys(pack.files).length} 个文件（CC0）`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  fetchAssets().catch(error => {
    console.error(`资源准备失败：${error.message}`);
    process.exitCode = 1;
  });
}
