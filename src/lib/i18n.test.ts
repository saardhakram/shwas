import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import en from '../locales/en.json';
import hi from '../locales/hi.json';
import te from '../locales/te.json';
import ta from '../locales/ta.json';
import bn from '../locales/bn.json';
import mr from '../locales/mr.json';

type JsonRecord = Record<string, unknown>;

const LOCALES: Record<string, JsonRecord> = { en, hi, te, ta, bn, mr };

const ALLOWED_LITERAL_STRINGS = new Set([
  'Shwas',
  '#Shwas',
  'Gemini',
  'Google Maps',
  'OpenStreetMap',
  'OSM · Leaflet',
  'WhatsApp',
  'ML',
  'AQI',
  'PM2.5',
  'µg/m³',
  'CO₂',
  'GRNPK6',
]);

const USER_FACING_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt']);

function flattenKeys(obj: JsonRecord, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenKeys(v as JsonRecord, key));
    } else if (typeof v === 'string') {
      out[key] = v;
    }
  }
  return out;
}

function extractPlaceholders(value: string): string[] {
  return Array.from(value.matchAll(/\{\{(\w+)\}\}/g))
    .map((m) => m[1])
    .sort();
}

function walkTsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsxFiles(fullPath, out);
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
      out.push(fullPath);
    }
  }
  return out;
}

function collectUntranslatedLiterals(filePath: string): string[] {
  const code = fs.readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];

  const checkText = (raw: string, kind: string, pos: number) => {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text || !/[A-Za-z]/.test(text)) return;
    if (ALLOWED_LITERAL_STRINGS.has(text)) return;
    const line = sf.getLineAndCharacterOfPosition(pos).line + 1;
    violations.push(
      `${path.relative(process.cwd(), filePath)}:L${line} [${kind}] ${JSON.stringify(text)}`,
    );
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      checkText(node.getText(sf), 'text', node.getStart(sf));
    } else if (ts.isJsxAttribute(node)) {
      const attrName = node.name.getText(sf);
      if (
        USER_FACING_ATTRS.has(attrName) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      ) {
        checkText(node.initializer.text, attrName, node.getStart(sf));
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return violations;
}

describe('i18n completeness and literal UI string guard', () => {
  const enFlat = flattenKeys(en);
  const enKeys = Object.keys(enFlat).sort();

  for (const [code, data] of Object.entries(LOCALES)) {
    if (code === 'en') continue;

    it(`locale "${code}" contains every key from en.json with matching placeholders`, () => {
      const flat = flattenKeys(data);
      const missing = enKeys.filter((k) => !(k in flat));
      const empty = enKeys.filter(
        (k) => typeof flat[k] === 'string' && flat[k].trim().length === 0,
      );
      const mismatchedPlaceholders = enKeys.filter((k) => {
        if (!(k in flat)) return false;
        return (
          JSON.stringify(extractPlaceholders(enFlat[k])) !==
          JSON.stringify(extractPlaceholders(flat[k]))
        );
      });

      expect(missing, `Missing keys in ${code}.json`).toEqual([]);
      expect(empty, `Empty values in ${code}.json`).toEqual([]);
      expect(mismatchedPlaceholders, `Placeholder mismatches in ${code}.json`).toEqual([]);
    });
  }

  it('has zero untranslated literal English UI strings in non-test TSX files', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const tsxFiles = walkTsxFiles(srcDir);
    expect(tsxFiles.length).toBeGreaterThan(20);

    const violations = tsxFiles.flatMap((file) => collectUntranslatedLiterals(file));
    expect(violations).toEqual([]);
  });
});
