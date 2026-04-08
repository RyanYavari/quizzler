/**
 * GET /api/pdf?file=CA_Manual.pdf
 *
 * Serves PDF files from the data/ directory for in-app viewing.
 * Only allows .pdf files to prevent directory traversal attacks.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('file');

  if (!filename) {
    return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 });
  }

  // Security: only allow .pdf extension, no path traversal
  const sanitized = path.basename(filename);
  if (!sanitized.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 });
  }

  const filePath = path.resolve(DATA_DIR, sanitized);

  // Defense in depth: ensure resolved path is still within DATA_DIR
  if (!filePath.startsWith(DATA_DIR)) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${sanitized}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
