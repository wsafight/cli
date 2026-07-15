import type { NativeSessionSource, ParsedNativeSession } from "./types";
import type { SessionDatabase } from "./database";
import { readFile } from "node:fs/promises";

export interface SessionIndexCandidate { source: NativeSessionSource; path: string; text?: string; size: number; mtimeMs: number; cwd?: string }
export type VersionedParser = ((text: string, path: string, cwd?: string) => ParsedNativeSession | null) & { parserVersion?: number };
export type ParserMap = Partial<Record<NativeSessionSource, VersionedParser>>;

export async function indexSessionCandidates(db: SessionDatabase, candidates: SessionIndexCandidate[], parsers: ParserMap): Promise<void> {
  for (const candidate of candidates) {
    const parser = parsers[candidate.source];
    if (!parser) continue;
    const previous = db.getSourceFile(candidate.path);
    const parserVersion = parser.parserVersion ?? 1;
    if (previous && previous.size === candidate.size && previous.mtimeMs === candidate.mtimeMs && previous.parserVersion === parserVersion && previous.sessionKey) continue;
    const text = candidate.text ?? await readFile(candidate.path, "utf8");
    const parsed = parser(text, candidate.path, candidate.cwd);
    if (!parsed) continue;
    db.replaceSession({ ...parsed, parserVersion }, candidate);
  }
}
