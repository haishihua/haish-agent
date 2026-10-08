import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location("gate", Path(__file__).parents[1] / "check-runtime-dependencies.py")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class DependencyGateTests(unittest.TestCase):
    def check(self, dependencies, installed):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "pyproject.toml").write_text(
                '[project]\ndependencies = []\n[project.optional-dependencies]\napp = ' + json.dumps(dependencies)
            )
            def distribution(name):
                if name not in installed:
                    raise gate.metadata.PackageNotFoundError(name)
                version, requires = installed[name]
                return SimpleNamespace(version=version, requires=requires)
            with patch.object(gate.metadata, "distribution", distribution):
                return gate.check_dependencies(root)

    def test_missing_app_extra(self):
        self.assertIn("croniter", self.check(["croniter>=6,<7"], {})[0])

    def test_incompatible_version(self):
        self.assertIn("Incompatible", self.check(["mcp>=1.26,<2"], {"mcp": ("2.1", [])})[0])

    def test_missing_transitive_dependency(self):
        self.assertIn("python-dateutil", self.check(["croniter>=6,<7"], {"croniter": ("6.2.4", ["python-dateutil"])})[0])

    def test_extras_markers_and_cycles(self):
        installed = {"a": ("1", ['b; extra == "crypto"']), "b": ("1", ["a"])}
        self.assertEqual([], self.check(['a[crypto]', 'missing; sys_platform == "never"'], installed))
        del installed["b"]
        self.assertIn("b", self.check(["a[crypto]"], installed)[0])


if __name__ == "__main__":
    unittest.main()
