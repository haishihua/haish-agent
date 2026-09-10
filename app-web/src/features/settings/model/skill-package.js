import { strFromU8, unzipSync } from 'fflate';
import { JSON_SCHEMA, load } from 'js-yaml';

export const SKILL_PACKAGE_MAX_SIZE = 20 * 1024 * 1024;
const MANIFEST_MAX_SIZE = 256 * 1024;

export function validateSkillPackageFile(file) {
  if (!/\.(zip|skill)$/i.test(file.name)) return 'Choose a .zip or .skill package.';
  if (file.size > SKILL_PACKAGE_MAX_SIZE) return 'Package must be 20 MB or smaller.';
  return undefined;
}

// Inspect metadata only. Package instructions and scripts are never executed.
export function parseSkillPackage(bytes, packageName) {
  const invalid = validateSkillPackageFile({ name: packageName, size: bytes.byteLength });
  if (invalid) throw new Error(invalid);
  const candidates = [];
  let fileCount = 0;
  try {
    unzipSync(bytes, { filter: entry => {
      if (++fileCount > 4096) throw new Error();
      const parts = entry.name.split('/');
      if (entry.name.startsWith('/') || entry.name.includes('\\') || parts.includes('..')) throw new Error();
      if (!parts.includes('__MACOSX') && parts.at(-1) === 'SKILL.md') candidates.push(entry);
      return false;
    } });
  } catch { throw new Error('Cannot read this package. Choose a valid ZIP archive.'); }
  if (!candidates.length) throw new Error('No SKILL.md found in this package.');
  const depth = Math.min(...candidates.map(entry => entry.name.split('/').length));
  const manifests = candidates.filter(entry => entry.name.split('/').length === depth);
  if (manifests.length !== 1) throw new Error('Multiple skills found. Choose a package containing one skill.');
  const entry = manifests[0];
  if (entry.originalSize > MANIFEST_MAX_SIZE) throw new Error('SKILL.md is too large to read.');
  let content;
  try {
    const files = unzipSync(bytes, { filter: item => item.name === entry.name });
    if (files[entry.name].byteLength > MANIFEST_MAX_SIZE) throw new Error();
    content = strFromU8(files[entry.name]);
  } catch { throw new Error('Cannot read SKILL.md from this package.'); }
  const header = content.replace(/^\uFEFF/, '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!header) throw new Error('SKILL.md needs name and description in YAML frontmatter.');
  let metadata;
  try { metadata = load(header[1], { schema: JSON_SCHEMA }); }
  catch { throw new Error('Invalid YAML in SKILL.md.'); }
  if (typeof metadata?.name !== 'string' || !metadata.name.trim() || metadata.name.length > 128 || typeof metadata?.description !== 'string' || !metadata.description.trim() || metadata.description.length > 4096) {
    throw new Error('SKILL.md needs a valid name and description.');
  }
  return { name: metadata.name.trim(), description: metadata.description.trim(), packageName, manifestPath: entry.name };
}
