// 终端类工具（exec_command / write_stdin）：命令、cwd、退出码与尾部输出。
// 哪些工具算终端由 core/tool-names.js 的 TOOL_SHELL_NAMES 决定。
import {
  compactToolValue,
  firstToolDisplayValue,
  isRawToolResponseText,
  isToolFailure,
  outputJsonText,
  tailToolOutput,
  toolJsonText,
  toolPlainObject,
} from '../../../../core/tool-view-shared.js';
import { isToolInFlight } from '../../../../core/tool-status.js';
import { TOOL_TERMINAL_COMMAND_NAMES } from '../../../../core/tool-names.js';

function extractTerminalOutput(item, response, artifacts, data) {
  const rawToolOutput = isRawToolResponseText(item.toolOutput) ? '' : item.toolOutput;
  return firstToolDisplayValue(
    artifacts.output,
    artifacts.content,
    artifacts.text,
    artifacts.stdout,
    data.stdout,
    data.output,
    rawToolOutput,
  );
}

export function buildTerminalToolView(item, name) {
  const response = toolPlainObject(item.toolResponse);
  const subject = toolPlainObject(response.subject);
  const artifacts = toolPlainObject(response.artifacts);
  const data = toolPlainObject(response.data);
  const diagnostics = toolPlainObject(artifacts.diagnostics);
  const error = toolPlainObject(response.error);
  const input = toolPlainObject(item.toolInput);
  const command = input.command || input.cmd || '';
  const cwd = subject.cwd || '';
  const output = firstToolDisplayValue(
    item.terminalOutput,
    extractTerminalOutput(item, response, artifacts, data),
  );
  const stderr = firstToolDisplayValue(artifacts.stderr, data.stderr);
  const fallback = firstToolDisplayValue(error.message, response.summary, item.outputSummary);
  const exitCode = firstToolDisplayValue(error.exit_code, data.exit_code, diagnostics.exit_code);
  const failed = isToolFailure(item);
  const operation = String(response.operation || '');
  let label;
  // 只有自己开终端、带 command 输入的工具才念 "Shell <cmd>"；write_stdin 是续写已有进程，
  // 它的 label 要走下面的 Sent input / Interrupted process / Process finished。
  if (TOOL_TERMINAL_COMMAND_NAMES.has(name)) {
    label = command ? `Shell ${command}` : 'Shell';
  } else if (operation === 'interrupt' || input.chars === '\u0003') {
    label = 'Interrupted process';
  } else if (operation === 'interact' || input.chars) {
    label = 'Sent input';
  } else if (exitCode !== undefined && exitCode !== null && exitCode !== '') {
    label = `Process finished · exit ${exitCode}`;
  } else {
    label = 'Checked process';
  }
  return {
    mode: 'terminal',
    failed,
    label,
    command,
    cwd,
    requestJson: toolJsonText(item.toolInput),
    responseJson: outputJsonText(response),
    stdout: output
      ? tailToolOutput(output)
      : (failed ? compactToolValue(fallback, 1200) : ''),
    stderr: stderr ? tailToolOutput(stderr) : '',
    exitCode,
    running: isToolInFlight(item.status),
    defaultOpen: false,
  };
}
