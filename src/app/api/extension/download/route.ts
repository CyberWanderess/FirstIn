import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

export async function GET() {
  const extDir = join(process.cwd(), 'extension');

  if (!existsSync(join(extDir, 'manifest.json'))) {
    return NextResponse.json({ success: false, error: 'Extension not found' }, { status: 404 });
  }

  try {
    // Build extension
    execSync('npm run build', { cwd: extDir, timeout: 30000 });

    // Create zip
    const zipPath = '/tmp/firstin-extension.zip';
    execSync(
      `zip -r ${zipPath} manifest.json dist/ src/popup/popup.html src/options/options.html icons/ -x "node_modules/*"`,
      { cwd: extDir },
    );

    const zipBuffer = readFileSync(zipPath);

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="firstin-extension.zip"',
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `Build failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
