#!/usr/bin/env bun

function isOpentuiMissing(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === "ERR_MODULE_NOT_FOUND" ||
    code === "MODULE_NOT_FOUND" ||
    /@opentui\/core/.test(message)
  );
}

try {
  await import("./index-opentui");
} catch (error) {
  // @opentui/core is an optional dependency; if it failed to install, fall
  // back to the Ink UI instead of crashing with a module-not-found error.
  // Keep index-ink available so platforms can be switched back quickly.
  if (!isOpentuiMissing(error)) throw error;
  await import("./index-ink");
}

export {};
