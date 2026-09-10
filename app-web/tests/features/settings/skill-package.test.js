import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { parseSkillPackage, validateSkillPackageFile, SKILL_PACKAGE_MAX_SIZE } from '../../../src/features/settings/model/skill-package.js';

const manifest = '---\nname: release-notes\ndescription: >-\n  Summarize changes\n  for a release.\n---\n# Instructions\n';
const archive = entries => zipSync(Object.fromEntries(Object.entries(entries).map(([name, content]) => [name, strToU8(content)])));

test('reads root or wrapped skill packages, including folded YAML and nested supporting files', () => {
  for (const prefix of ['', 'release-notes/']) {
    const parsed = parseSkillPackage(archive({ [`${prefix}SKILL.md`]: manifest, [`${prefix}references/example/SKILL.md`]: 'reference', [`${prefix}scripts/run.sh`]: 'not executed' }), 'release-notes.skill');
    assert.equal(parsed.name, 'release-notes');
    assert.equal(parsed.description, 'Summarize changes for a release.');
    assert.equal(parsed.manifestPath, `${prefix}SKILL.md`);
  }
});

test('rejects broken, ambiguous and incomplete packages with actionable errors', () => {
  assert.throws(() => parseSkillPackage(strToU8('not a zip'), 'broken.zip'), /valid ZIP/);
  assert.throws(() => parseSkillPackage(archive({ 'README.md': 'hello' }), 'empty.zip'), /No SKILL.md/);
  assert.throws(() => parseSkillPackage(archive({ 'a/SKILL.md': manifest, 'b/SKILL.md': manifest }), 'two.zip'), /Multiple skills/);
  for (const content of ['# No metadata', '---\nname: demo\n---\n', '---\nname: [bad\ndescription: text\n---\n']) {
    assert.throws(() => parseSkillPackage(archive({ 'SKILL.md': content }), 'bad.zip'), /SKILL.md/);
  }
});

test('bounds package and metadata size, rejects unsafe paths and non-package files', () => {
  assert.match(validateSkillPackageFile({ name: 'file.txt', size: 100 }), /\.zip/);
  assert.match(validateSkillPackageFile({ name: 'file.zip', size: SKILL_PACKAGE_MAX_SIZE + 1 }), /20 MB/);
  assert.throws(() => parseSkillPackage(archive({ '../SKILL.md': manifest }), 'bad.zip'), /valid ZIP/);
  assert.throws(() => parseSkillPackage(archive({ 'SKILL.md': manifest + 'a'.repeat(256 * 1024) }), 'large.zip'), /too large/);
});
