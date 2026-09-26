// siteproof extension for pi and omp (loaded from package.json "pi".extensions).
//  - Exports SITEPROOF_SKILL_DIR, so the skill finds its scripts even where the model isn't shown the skill's path.
//  - Warms up the npm dependencies in the background when a session starts.
//  - Blocks tool calls that break siteproof's rules. Same rules as the Claude-format hook (hooks/guard.mjs) and
//    the commit check in `proof.mjs build`: skills/siteproof/scripts/lib/rules.mjs.
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decide } from "../skills/siteproof/scripts/lib/rules.mjs";

// The subset of the pi / omp ExtensionAPI this file uses; both hosts provide it.
interface ToolCallEvent {
	toolName?: string;
	input?: Record<string, unknown>;
}
interface ExtensionAPI {
	on(event: "session_start", handler: () => Promise<void>): void;
	on(
		event: "tool_call",
		handler: (event: ToolCallEvent, ctx: { cwd?: string } | undefined) => Promise<{ block: true; reason: string } | undefined>,
	): void;
	exec(command: string, args: string[], options: { cwd?: string; timeout?: number }): Promise<unknown>;
}

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "siteproof");
const SHELL_TOOLS: Record<string, true> = { bash: true, powershell: true, shell: true };

const strings = (...values: unknown[]): string[] => values.filter((v): v is string => typeof v === "string" && v !== "");

function isFixing(cwd: string): boolean {
	try {
		return Date.now() - statSync(join(cwd, "siteproof", ".fixing")).mtimeMs < 24 * 3600 * 1000;
	} catch {
		return false;
	}
}

export default function siteproof(pi: ExtensionAPI): void {
	process.env.SITEPROOF_SKILL_DIR = SKILL_DIR;

	pi.on("session_start", async () => {
		// Not awaited: a first install takes minutes. The skill runs setup again as step 0 and waits for this one.
		pi.exec("node", [join(SKILL_DIR, "scripts", "setup.mjs"), "--hook"], { cwd: SKILL_DIR, timeout: 600_000 }).catch(() => {});
	});

	pi.on("tool_call", async (event, ctx) => {
		const tool = event.toolName ?? "";
		const input = event.input ?? {};
		let reason: string | null;
		if (SHELL_TOOLS[tool]) {
			reason = decide({ command: String(input.command ?? "") }, false);
		} else {
			// write/edit (pi: path + oldText/newText or edits[]; omp: normalised path/paths).
			const paths = strings(input.path, input.file_path, ...(Array.isArray(input.paths) ? input.paths : []));
			if (!paths.length) return undefined;
			const edits = (Array.isArray(input.edits) ? input.edits : []) as Array<Record<string, unknown>>; // edit-tool rows: plain objects
			reason = decide(
				{
					paths,
					added: strings(input.content, input.newText, input.new_string, ...edits.map(e => e.newText ?? e.new_string)).join("\n"),
					removed: strings(input.oldText, input.old_string, ...edits.map(e => e.oldText ?? e.old_string)).join("\n"),
				},
				isFixing(ctx?.cwd ?? process.cwd()),
			);
		}
		return reason ? { block: true, reason } : undefined;
	});
}
