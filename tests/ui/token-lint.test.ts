import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walk a directory tree and collect all .ts file paths. */
function walkTs(dir: string): string[] {
  const results: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      results.push(...walkTs(p));
    } else if (name.endsWith('.ts')) {
      results.push(p);
    }
  }
  return results;
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;

/** Allowed paths: everything outside src/ui, src/render, src/state, src/styles */
function isPersonBFile(path: string): boolean {
  const norm = path.replace(/\\/g, '/');
  return (
    norm.includes('/src/ui/') ||
    norm.includes('/src/render/') ||
    norm.includes('/src/state/')
  );
}

describe('token lint — no raw hex in Person B TypeScript files', () => {
  const srcDir = fileURLToPath(new URL('../../src', import.meta.url));
  const files = walkTs(srcDir).filter(isPersonBFile);

  it('found Person B source files to lint', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`no raw hex in ${file.replace(/\\/g, '/').split('/src/')[1] ?? file}`, () => {
      const src = readFileSync(file, 'utf8');
      const matches = src.match(HEX_RE) ?? [];
      // Filter: allow hex in comments and string literals that are legitimate colour names (e.g. in the validated palette constant in lab)
      const inCode = matches.filter((m) => {
        // A hex value embedded in a string in comments is OK; look for it unquoted in code context
        // Simple heuristic: if the whole line is a comment, skip
        const idx = src.indexOf(m);
        const lineStart = src.lastIndexOf('\n', idx) + 1;
        const line = src.slice(lineStart, src.indexOf('\n', idx));
        return !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*');
      });
      expect(inCode, `Found raw hex in ${file}: ${inCode.join(', ')}`).toHaveLength(0);
    });
  }
});
