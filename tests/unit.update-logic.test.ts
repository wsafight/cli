import { describe, it, expect } from "bun:test";
import { getTakoDir, getTakoCliDir, getBunBin, isWindows } from "./_helpers/paths";
import { expectInTakoDir } from "./_helpers/assertions";
import { buildCliInstallCommand, buildCliUpdateCommand } from "../src/updater";

describe("Update Logic - path configuration", () => {
  const takoDir = getTakoDir();
  const cliDir = getTakoCliDir();

  it("Tako CLI directory should be under Tako directory", () => {
    expectInTakoDir(cliDir, takoDir);
  });

  it("update command should not contain -g flag", () => {
    const command = buildCliUpdateCommand();
    expect(command).not.toContain("-g");
  });

  it("working directory should be set to Tako CLI directory", () => {
    const cwd = cliDir;
    expectInTakoDir(cwd, takoDir);
  });

  it("Bun executable path should be correct for platform", () => {
    const bunBin = getBunBin();

    if (isWindows()) {
      expect(bunBin).toEndWith(".exe");
    } else {
      expect(bunBin).not.toEndWith(".exe");
    }
  });

  it("update command should include package name", () => {
    const command = buildCliUpdateCommand();
    expect(command).toContain("tako-cli");
  });

  it("update command should use update subcommand with --latest", () => {
    const command = buildCliUpdateCommand();
    expect(command).toContain("update");
    expect(command).toContain("--latest");
  });

  it("update/install should keep optional dependencies for OpenTUI", () => {
    expect(buildCliUpdateCommand()).not.toContain("--omit");
    expect(buildCliUpdateCommand()).not.toContain("optional");
    expect(buildCliInstallCommand()).not.toContain("--omit");
    expect(buildCliInstallCommand()).not.toContain("optional");
  });
});
