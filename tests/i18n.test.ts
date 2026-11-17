import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { MESSAGES, SUPPORTED_LOCALES, getMessages, resolveLocale, toHtmlLang } from '../src/shared/i18n.ts';
import type { LocaleCode } from '../src/shared/types.ts';

const LOCALES: LocaleCode[] = ['zh_CN', 'zh_TW', 'en', 'ja', 'ko'];

function flattenKeys(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof obj === 'string') {
    out[prefix] = obj;
    return out;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const nextKey = prefix ? `${prefix}.${k}` : k;
      Object.assign(out, flattenKeys(v, nextKey));
    }
  }
  return out;
}

test('resolveLocale handles explicit and auto browser languages properly', () => {
  assert.equal(resolveLocale('auto', 'zh-CN'), 'zh_CN');
  assert.equal(resolveLocale('auto', 'zh-SG'), 'zh_CN');
  assert.equal(resolveLocale('auto', 'zh-TW'), 'zh_TW');
  assert.equal(resolveLocale('auto', 'zh-HK'), 'zh_TW');
  assert.equal(resolveLocale('auto', 'zh-Hant-TW'), 'zh_TW');
  assert.equal(resolveLocale('auto', 'en-US'), 'en');
  assert.equal(resolveLocale('auto', 'ja-JP'), 'ja');
  assert.equal(resolveLocale('auto', 'ko-KR'), 'ko');
  assert.equal(resolveLocale('auto', 'fr-FR'), 'en');

  assert.equal(resolveLocale('ja', 'en-US'), 'ja');
  assert.equal(resolveLocale('ko', 'zh-CN'), 'ko');
  assert.equal(toHtmlLang('zh_CN'), 'zh-CN');
  assert.equal(toHtmlLang('zh_TW'), 'zh-TW');
  assert.equal(toHtmlLang('ja'), 'ja');
  assert.equal(getMessages('en').hud.startBtn.includes('Start'), true);
  assert.equal(SUPPORTED_LOCALES.length, 6);
});

test('All 5 locales in MESSAGES have identical complete key sets and non-empty strings', () => {
  const baseFlat = flattenKeys(MESSAGES.zh_CN);
  const baseKeys = Object.keys(baseFlat).sort();
  assert.ok(baseKeys.length > 100);

  for (const loc of LOCALES) {
    const flat = flattenKeys(MESSAGES[loc]);
    const keys = Object.keys(flat).sort();
    assert.deepEqual(keys, baseKeys, `Locale ${loc} key mismatch`);
    for (const k of keys) {
      assert.ok(flat[k].trim().length > 0, `Empty translation for ${loc}.${k}`);
    }
  }
});

test('Manifest __MSG_*__ placeholders match all 5 public/_locales/*/messages.json within store limits', () => {
  const manifestRaw = readFileSync(resolve('public/manifest.json'), 'utf8');
  const msgRefs = new Set<string>();
  for (const match of manifestRaw.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) {
    msgRefs.add(match[1]);
  }
  assert.ok(msgRefs.has('extName') && msgRefs.has('extDesc') && msgRefs.has('actionTitle'));

  for (const loc of LOCALES) {
    const jsonPath = resolve(`public/_locales/${loc}/messages.json`);
    const dict = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<string, { message: string }>;

    for (const key of msgRefs) {
      assert.ok(dict[key] && typeof dict[key].message === 'string' && dict[key].message.length > 0, `Missing ${loc}:${key}`);
    }

    assert.ok(
      dict.extName.message.length <= 45,
      `${loc} extName exceeds 45 chars: ${dict.extName.message.length}`,
    );
    assert.ok(
      dict.extDesc.message.length <= 132,
      `${loc} extDesc exceeds 132 chars: ${dict.extDesc.message.length}`,
    );
  }
});
