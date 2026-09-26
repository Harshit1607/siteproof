#!/usr/bin/env node
// PreToolUse guard for harnesses that run Claude-format hooks (Claude Code, Codex, GitHub Copilot).
// Reduces the harness's tool call to siteproof's neutral shape and applies the shared rules in
// skills/siteproof/scripts/lib/rules.mjs. Blocks by exiting 2 with the reason on stderr; exit 0 = no opinion.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decide as decideCall, parsePatch } from '../skills/siteproof/scripts/lib/rules.mjs';

const SHELL = /^(Bash|bash|shell|run_command|run_in_terminal|powershell|PowerShell)$/;
const EDIT = /^(Edit|Write|MultiEdit|NotebookEdit|edit|write|create|str_replace|str_replace_editor)$/;

/** Claude / Codex / Copilot tool call → { command } | { paths, added, removed } | null (not ours to judge). */
export function normalize(tool, input = {}) {
  // Codex edits files with apply_patch; the patch text arrives in `command` (or `input`).
  if (tool === 'apply_patch') {
    const files = parsePatch(input.command ?? input.input ?? input.patch);
    return { paths: files.map(f => f.path), added: files.map(f => f.added).join('\n'), removed: files.map(f => f.removed).join('\n') };
  }
  if (SHELL.test(tool)) return { command: Array.isArray(input.command) ? input.command.join(' ') : String(input.command ?? '') };
  if (!EDIT.test(tool)) return null;
  const edits = input.edits ?? [];
  return {
    paths: [input.file_path, input.path, input.notebook_path, ...edits.map(e => e.file_path ?? e.path)].filter(Boolean),
    added: [input.content, input.new_string, input.new_str, input.file_text, ...edits.map(e => e.new_string)].filter(Boolean).join('\n'),
    removed: [input.old_string, input.old_str, ...edits.map(e => e.old_string)].filter(Boolean).join('\n'),
  };
}

export function decide({ tool_name: tool, tool_input: input = {} }, fixing) {
  const call = normalize(tool, input);
  return call ? decideCall(call, fixing) : null;
}

export function isFixing(cwd) {
  try { return Date.now() - statSync(join(cwd, 'siteproof', '.fixing')).mtimeMs < 24 * 3600 * 1000; } catch { return false; }
}

export function main() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
  const reason = decide(payload, isFixing(payload.cwd ?? process.cwd()));
  if (reason) { process.stderr.write(reason + '\n'); process.exit(2); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
