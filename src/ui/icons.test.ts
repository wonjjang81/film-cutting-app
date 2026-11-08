import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

describe('lucide icon imports', () => {
  it('never imports the whole icon library from the package root', () => {
    const offenders = ['app', 'src']
      .flatMap((root) => sourceFiles(join(__dirname, '..', '..', root)))
      .filter((file) => /from ['"]lucide-react-native['"]/.test(readFileSync(file, 'utf8')));
    expect(offenders, '아이콘은 src/ui/icons.ts에 개별 경로로 추가해 가져오세요').toEqual([]);
  });
});
