import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const sourceRoot = process.env.HAISH_RUNTIME_SOURCE
  ? path.resolve(process.env.HAISH_RUNTIME_SOURCE)
  : path.resolve(appRoot, '../../py-project/haishihua-agent-core');
const buildRoot = path.join(appRoot, 'build', 'runtime');
const runtimeRoot = path.join(buildRoot, 'haishihua-agent-core');
const buildVenvPath = path.join(buildRoot, '.pyinstaller-venv');
const pyinstallerWorkPath = path.join(buildRoot, 'pyinstaller-work');
const pyinstallerSpecPath = path.join(buildRoot, 'pyinstaller-spec');
const runtimeLauncherPath = path.join(buildRoot, 'haish-runtime-launcher.py');

const runtimeFiles = [
  '.env',
  'pyproject.toml',
  'README.md',
  'mcp.json',
  'src',
];

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd || appRoot,
    env: {
      ...process.env,
      PIP_DISABLE_PIP_VERSION_CHECK: '1',
      PYTHONDONTWRITEBYTECODE: '1',
      ...(options.env || {}),
    },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function copyRuntimeFile(name) {
  const from = path.join(sourceRoot, name);
  const to = path.join(runtimeRoot, name);
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, to, {
    recursive: true,
    force: true,
    filter: (src) => {
      const base = path.basename(src);
      if (base === '.git' || base === '.venv' || base === '__pycache__') return false;
      if (base === '.pytest_cache' || base === '.mypy_cache' || base === '.ruff_cache') return false;
      if (base === '.agent-world-web.log') return false;
      if (base.endsWith('.pyc') || base.endsWith('.pyo')) return false;
      return true;
    },
  });
}

function pruneRuntime() {
  const removableNames = new Set([
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    '.ruff_cache',
    'tests',
    'test',
  ]);
  const removablePaths = [
    path.join(runtimeRoot, 'src', 'haishihua_agent_core', 'app', 'frontend'),
  ];
  for (const removablePath of removablePaths) {
    fs.rmSync(removablePath, { recursive: true, force: true });
  }
  const removableSuffixes = ['.pyc', '.pyo', '.dist-info/RECORD'];
  const stack = [runtimeRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;
    const stat = fs.lstatSync(current);
    const base = path.basename(current);
    if (current !== runtimeRoot && removableNames.has(base)) {
      fs.rmSync(current, { recursive: true, force: true });
      continue;
    }
    if (stat.isFile() && removableSuffixes.some((suffix) => current.endsWith(suffix))) {
      fs.rmSync(current, { force: true });
      continue;
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
    }
  }
}

function writeRuntimeLauncher() {
  fs.writeFileSync(
    runtimeLauncherPath,
    [
      'from haishihua_agent_core.app.web import main',
      '',
      'if __name__ == "__main__":',
      '    main()',
      '',
    ].join('\n'),
  );
}

function removeInstalledRuntimePackage(venvPython) {
  spawnSync(venvPython, ['-m', 'pip', 'uninstall', '-y', 'haishihua-agent-core'], {
    cwd: appRoot,
    env: {
      ...process.env,
      PIP_DISABLE_PIP_VERSION_CHECK: '1',
      PYTHONDONTWRITEBYTECODE: '1',
    },
    stdio: 'inherit',
  });

  const sitePackages = spawnSync(
    venvPython,
    ['-c', 'import site; print(site.getsitepackages()[0])'],
    {
      cwd: appRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PIP_DISABLE_PIP_VERSION_CHECK: '1',
        PYTHONDONTWRITEBYTECODE: '1',
      },
    },
  ).stdout.trim();
  if (!sitePackages) return;
  fs.rmSync(path.join(sitePackages, 'haishihua_agent_core'), { recursive: true, force: true });
  for (const entry of fs.readdirSync(sitePackages)) {
    if (/^haishihua_agent_core-.*\.(dist-info|egg-info)$/.test(entry)) {
      fs.rmSync(path.join(sitePackages, entry), { recursive: true, force: true });
    }
  }
}

function removeSourceBuildArtifacts() {
  fs.rmSync(path.join(sourceRoot, 'build'), { recursive: true, force: true });
}

function main() {
  if (!fs.existsSync(path.join(sourceRoot, 'pyproject.toml'))) {
    throw new Error(`Runtime source is missing pyproject.toml: ${sourceRoot}`);
  }

  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });
  for (const file of runtimeFiles) {
    copyRuntimeFile(file);
  }
  // Bundled skills now ship as package data under src/haishihua_agent_core/skills/
  // and are picked up by PyInstaller's collect_data_files. No extra copy here.

  const python = process.env.HAISH_RUNTIME_BUILD_PYTHON || 'python3';
  fs.rmSync(buildVenvPath, { recursive: true, force: true });
  fs.rmSync(pyinstallerWorkPath, { recursive: true, force: true });
  fs.rmSync(pyinstallerSpecPath, { recursive: true, force: true });
  run(python, ['-m', 'venv', '--copies', buildVenvPath]);
  const venvPython = path.join(buildVenvPath, 'bin', 'python');
  run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel']);
  run(venvPython, [
    '-m',
    'pip',
    'install',
    'pyinstaller',
    'httpx',
    'openai',
    'python-dotenv',
    'tiktoken',
    'fastapi',
    'mcp',
    'neo4j',
    'pypdf',
    'qdrant-client',
    'python-multipart',
    'uvicorn',
  ]);
  removeSourceBuildArtifacts();
  removeInstalledRuntimePackage(venvPython);
  run(venvPython, ['-m', 'pip', 'install', '--no-cache-dir', '--force-reinstall', '--no-deps', sourceRoot]);
  pruneRuntime();
  writeRuntimeLauncher();
  run(venvPython, [
    '-m',
    'PyInstaller',
    '--clean',
    '--noconfirm',
    '--onedir',
    '--name',
    'haish-runtime',
    '--distpath',
    path.join(runtimeRoot, 'bin'),
    '--workpath',
    pyinstallerWorkPath,
    '--specpath',
    pyinstallerSpecPath,
    '--paths',
    path.join(runtimeRoot, 'src'),
    '--collect-submodules',
    'haishihua_agent_core',
    '--collect-submodules',
    'tiktoken_ext',
    '--collect-data',
    'haishihua_agent_core',
    '--collect-data',
    'tiktoken',
    runtimeLauncherPath,
  ]);
  console.log(`Built minimal runtime at ${runtimeRoot}`);
}

main();
