import { spawnSync } from 'node:child_process';

function run(command, args) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
  });
}

function hasAllEnv(names) {
  return names.every((name) => Boolean(process.env[name]));
}

function fail(message, details = []) {
  console.error(message);
  for (const detail of details) {
    console.error(`- ${detail}`);
  }
  process.exit(1);
}

if (process.platform !== 'darwin') {
  fail('macOS release builds must run on macOS.');
}

const identities = run('security', ['find-identity', '-v', '-p', 'codesigning']);
if (identities.status !== 0) {
  fail('Unable to inspect macOS code signing identities.', [
    identities.stderr.trim() || identities.stdout.trim() || 'security find-identity failed',
  ]);
}

if (!/Developer ID Application:/.test(identities.stdout)) {
  fail('Missing Developer ID Application certificate for distributable macOS builds.', [
    'Install a valid Apple Developer ID Application certificate in this keychain.',
    'Current keychain output did not include "Developer ID Application:".',
  ]);
}

const hasAppSpecificPassword = hasAllEnv([
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
]);
const hasApiKey = hasAllEnv([
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER',
]);
const hasKeychainProfile = Boolean(process.env.APPLE_KEYCHAIN_PROFILE);

if (!hasAppSpecificPassword && !hasApiKey && !hasKeychainProfile) {
  fail('Missing Apple notarization credentials.', [
    'Set APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER; or',
    'Set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID; or',
    'Set APPLE_KEYCHAIN_PROFILE for a notarytool keychain profile.',
  ]);
}

const notarytool = run('xcrun', ['notarytool', '--version']);
if (notarytool.status !== 0) {
  fail('xcrun notarytool is unavailable.', [
    'Install or select a recent Xcode command line tools environment.',
  ]);
}

console.log('macOS release signing prerequisites are available.');
