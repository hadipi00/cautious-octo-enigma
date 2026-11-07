// Serves the static AIRDOM game (repo root files) through Next.js on port 3000.
// The game is a vanilla ES-module app (importmap + relative paths), so a 1:1
// static file mapping of the project root is exactly what it needs.
import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';

const ROOT = path.resolve(process.cwd());

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.wat': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path?: string[] }> }
) {
  const { path: parts } = await ctx.params;
  const rel = parts && parts.length ? parts.join('/') : 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    return new NextResponse('forbidden', { status: 403 });
  }
  const serve = async (target: string) => {
    const data = await readFile(target);
    const ext = path.extname(target).toLowerCase();
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      },
    });
  };
  try {
    let target = file;
    try {
      const st = await stat(target);
      if (st.isDirectory()) target = path.join(target, 'index.html');
    } catch {
      /* fall through to read */
    }
    return await serve(target);
  } catch {
    // SPA-style fallback: unknown paths land on the game shell
    try {
      return await serve(path.join(ROOT, 'index.html'));
    } catch {
      return new NextResponse('not found', { status: 404 });
    }
  }
}
