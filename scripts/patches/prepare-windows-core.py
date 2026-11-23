"""Apply the Windows preview compatibility changes to a staged core checkout."""
from pathlib import Path
import io
import subprocess
import tarfile
import sys

CORE_REF = '09ecf0ae893a9f54c10d01d08e070a618b95943b'

LOCK_MODULE = '''from contextlib import contextmanager
import os


@contextmanager
def file_lock(handle, *, shared=False):
    if os.name == "nt":
        import msvcrt

        # Lock a byte range even on an empty file; readers also take an
        # exclusive lock on Windows. Never unlink the lock file.
        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        try:
            yield
        finally:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        import fcntl

        fcntl.flock(handle.fileno(), fcntl.LOCK_SH if shared else fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
'''


def prepare(source: Path, staged: Path) -> None:
    head = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    if head != CORE_REF:
        raise ValueError(f'Windows preview requires core {CORE_REF}; got {head}')
    archive = subprocess.check_output(['git', '-C', str(source), 'archive', CORE_REF])
    with tarfile.open(fileobj=io.BytesIO(archive)) as tree:
        tree.extractall(staged, filter='data')
    package = staged / 'src' / 'haish_agent_core'
    changes = {}

    def replace(relative, old, new):
        file = package / relative
        text = changes.get(file)
        if text is None:
            text = file.read_text(encoding='utf-8')
        if text.count(old) != 1:
            raise ValueError(f'Unexpected source in {relative}; cannot apply Windows preview changes')
        changes[file] = text.replace(old, new)

    replace('app/local_identity.py', 'import fcntl\n', '')
    replace('app/local_identity.py', 'from uuid import uuid4\n', 'from uuid import uuid4\n\nfrom .._file_lock import file_lock\n')
    replace('app/local_identity.py', 'with (root / "owner-id.lock").open("a") as lock:\n        fcntl.flock(lock, fcntl.LOCK_EX)',
            'with (root / "owner-id.lock").open("a+b") as lock, file_lock(lock):')
    replace('llm/auth/store.py', 'import fcntl\n', 'from ..._file_lock import file_lock\n')
    replace('llm/auth/store.py', '''        with lock_path.open("a+", encoding="utf-8") as handle:
            lock_mode = fcntl.LOCK_SH if shared else fcntl.LOCK_EX
            fcntl.flock(handle.fileno(), lock_mode)
            try:
                yield
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
''', '''        with lock_path.open("a+b") as handle, file_lock(handle, shared=shared):
            yield
''')
    # Windows cannot open a directory for fsync via os.open. Keep the file
    # fsync and atomic replace, and retain directory fsync where supported.
    for target in ('path.parent', 'root'):
        opening = f'os.open(str({target}), os.O_DIRECTORY)'
        replace('app/session_parts/core.py', opening,
                f'{opening} if hasattr(os, "O_DIRECTORY") else None')
    # The existing shell approval parser is Bash-specific. Do not route its
    # approvals into cmd.exe or PowerShell; disable execution for this preview.
    replace('tool/terminal.py', 'import pty\n', '')
    replace('tool/terminal.py', '            if tty:\n                master_fd, slave_fd = pty.openpty()',
            '            if os.name == "nt":\n                raise OSError("Terminal execution is unavailable in the Windows preview.")\n            if tty:\n                import pty\n\n                master_fd, slave_fd = pty.openpty()')
    replace('tool/terminal.py', '''        decision = self.approval_engine.decide_exec_command(
''', '''        if os.name == "nt":
            return _invalid_request(self.name, "Terminal execution is unavailable in the Windows preview.", started_at)

        decision = self.approval_engine.decide_exec_command(
''')
    changes[package / '_file_lock.py'] = LOCK_MODULE
    for file, contents in changes.items():
        file.write_text(contents, encoding='utf-8')


if __name__ == '__main__':
    prepare(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
