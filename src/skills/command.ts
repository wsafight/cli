import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { BUNDLED_SKILLS } from './index';

export async function runSkillCommand(args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || sub === 'list') {
    console.log('\nAvailable skills:\n');
    for (const s of BUNDLED_SKILLS) {
      console.log(`  ${s.name.padEnd(20)} ${s.description}`);
    }
    console.log(`\nInstall: tako skill install <name>`);
    console.log(`Install all: tako skill install --all\n`);
    return;
  }

  if (sub === 'install') {
    const target = args[1];
    if (!target) {
      console.error('Usage: tako skill install <name|--all>');
      process.exit(1);
    }

    const skills = target === '--all' ? BUNDLED_SKILLS : BUNDLED_SKILLS.filter(s => s.name === target);
    if (skills.length === 0) {
      console.error(`Skill "${target}" not found. Run "tako skill list" to see available skills.`);
      process.exit(1);
    }

    const baseDir = join(process.cwd(), '.claude', 'skills');

    for (const skill of skills) {
      const dir = join(baseDir, skill.name);
      const filePath = join(dir, skill.filename);

      if (existsSync(filePath)) {
        console.log(`  skip  ${skill.name} (already exists)`);
        continue;
      }

      mkdirSync(dir, { recursive: true });
      await Bun.write(filePath, skill.content);
      console.log(`  ✓ installed ${skill.name} → .claude/skills/${skill.name}/${skill.filename}`);
    }
    return;
  }

  console.error(`Unknown subcommand: ${sub}. Try "tako skill list" or "tako skill install <name>".`);
  process.exit(1);
}
