# Windows x64 预览包

和 macOS 共用 Electron、Web UI 和 Python 运行时源码；Windows 冻结运行时及 NSIS 安装器在 GitHub Actions 的 Windows x64 runner 上生成。

- 工作流：`.github/workflows/build-windows.yml`。推送 `feat/windows-client` 触发预览构建，不需要先把工作流合入 `master`。工作流进入默认分支后也可手动触发。
- 工作流固定使用 包含运行时诊断接口的核心提交 `09ecf0ae893a9f54c10d01d08e070a618b95943b`；私有仓库读取沿用 `HAISH_PAT`。Windows 构建只对该提交的独立源码副本应用 `scripts/patches/prepare-windows-core.py`，不修改原 checkout 或 macOS 构建。
- Windows 用 `msvcrt` 对本地身份和凭据存储加锁；终端工具暂不执行命令。现有审批规则针对 Bash，不能直接用于 PowerShell 或 CMD。
- 构建及包内运行时冒烟检查通过后，安装器仅上传到该 Actions run 的 Artifacts，不写入 GitHub Release，也不触发 macOS 工作流。
- 预览版无签名，不启用自动更新或远程控制；不进行 Windows 安装器/UI E2E。
