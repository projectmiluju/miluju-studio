/**
 * miluju update — 스킬 자동 업데이트
 *
 * .milurc.json의 설치 레코드를 확인하여 새 버전 스킬이 있으면
 * 대상 프로젝트에 덮어씁니다. 업데이트 후 레코드를 갱신합니다.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AgentTarget } from "../../src/lib/transformer.js";
import { checkSkillVersions } from "./update-check.js";
import { fetchSkillContent } from "../lib/registry.js";

/** 에이전트별 스킬 설치 경로 (install.ts의 AGENT_INSTALL_MAP과 동기화) */
const AGENT_SKILL_PATH: Record<AgentTarget, { dir: string; format: "flat" | "directory" | "instructions"; extension?: string }> = {
  "claude-code": { dir: ".claude/commands", format: "flat" },
  cursor:        { dir: ".cursor/rules",    format: "flat" },
  gemini:        { dir: "skills",           format: "flat" },
  codex:         { dir: ".agents/skills",   format: "directory" },
  copilot:       { dir: ".github/instructions", format: "instructions", extension: ".instructions.md" },
  antigravity:   { dir: ".agent/skills",    format: "directory" },
  kiro:          { dir: ".kiro/steering",   format: "flat" },
  windsurf:      { dir: ".windsurf/rules",  format: "flat" },
};

function getMiluRoot(): string {
  return resolve(import.meta.dirname, "..", "..");
}

/** 스킬 1개를 에이전트 형식에 맞게 대상 경로에 씁니다 */
async function writeSkillFile(
  content: string,
  skillName: string,
  installDir: string,
  format: "flat" | "directory" | "instructions",
  extension?: string
): Promise<void> {
  if (format === "directory") {
    const skillDir = join(installDir, skillName);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), content, "utf-8");
  } else {
    await mkdir(installDir, { recursive: true });
    const filename = extension ? `${skillName}${extension}` : `${skillName}.md`;
    await writeFile(join(installDir, filename), content, "utf-8");
  }
}

/** .milurc.json의 스킬 버전 레코드를 갱신합니다 */
async function updateMilurcVersions(
  targetDir: string,
  updatedVersions: Record<string, string>
): Promise<void> {
  const path = join(targetDir, ".milurc.json");
  let milurc: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      milurc = JSON.parse(await readFile(path, "utf-8"));
    } catch { /* ignore */ }
  }

  const skills = (milurc.skills ?? {}) as Record<string, unknown>;
  const current = (skills.skillVersions ?? {}) as Record<string, string>;
  skills.skillVersions = { ...current, ...updatedVersions };
  skills.installedAt = new Date().toISOString();
  milurc.skills = skills;

  await writeFile(path, JSON.stringify(milurc, null, 2) + "\n", "utf-8");
}

export interface UpdateOptions {
  targetDir: string;
  /** 특정 스킬만 업데이트 (미지정 시 전체) */
  skills?: string[];
  /** 버전이 같아도 강제 업데이트 */
  force: boolean;
}

export async function runUpdate(options: UpdateOptions): Promise<void> {
  const { targetDir, skills: filterSkills, force } = options;

  console.log("🔄 miluju-studio 스킬 업데이트를 시작합니다.");
  console.log(`   대상 프로젝트: ${targetDir}\n`);

  // 버전 비교
  const skillResult = await checkSkillVersions(targetDir);

  if (!skillResult) {
    console.error("❌ 스킬 설치 기록이 없습니다.");
    console.error("   먼저 miluju install 로 스킬을 설치해주세요.");
    process.exit(1);
  }

  const { installed: installedRecord, updates } = skillResult;
  const agents = installedRecord.agents as AgentTarget[];

  // 업데이트 대상 필터링
  const targets = updates.filter((u) => {
    if (filterSkills && !filterSkills.includes(u.skill)) return false;
    return force || u.needsUpdate;
  });

  if (targets.length === 0) {
    console.log("✅ 모든 스킬이 최신 상태입니다. 업데이트할 내용이 없습니다.");
    if (!force) console.log("   강제 재설치: miluju update --force");
    return;
  }

  console.log(`업데이트 대상 스킬: ${targets.map((u) => u.skill).join(", ")}\n`);

  const miluRoot = getMiluRoot();
  const latestTag = skillResult.latestTag;
  const updatedVersions: Record<string, string> = {};

  for (const agent of agents) {
    const agentConfig = AGENT_SKILL_PATH[agent];
    if (!agentConfig) continue;

    const installDir = join(targetDir, agentConfig.dir);
    const localDistDir = join(miluRoot, "dist", "skills", agent);
    const hasLocal = existsSync(localDistDir);

    let updatedCount = 0;
    for (const { skill, latest } of targets) {
      let content: string | null = null;

      if (hasLocal) {
        const src = join(localDistDir, `${skill}.md`);
        if (existsSync(src)) content = await readFile(src, "utf-8");
      }
      if (!content) {
        content = await fetchSkillContent(latestTag, agent, skill);
      }
      if (!content) {
        console.warn(`  ⚠️  ${agent}/${skill}: 콘텐츠를 가져올 수 없습니다.`);
        continue;
      }

      await writeSkillFile(content, skill, installDir, agentConfig.format, agentConfig.extension);
      updatedVersions[skill] = latest;
      updatedCount++;
    }

    console.log(`  ✅ ${agent}: ${updatedCount}개 스킬 업데이트 → ${agentConfig.dir}/`);
  }

  // .milurc.json 버전 갱신
  await updateMilurcVersions(targetDir, updatedVersions);

  console.log("");
  console.log(`✅ 업데이트 완료! (${targets.length}개 스킬)`);
  for (const u of targets) {
    console.log(`   ${u.skill}: v${u.installed} → v${u.latest}`);
  }
  console.log("");
  console.log("💾 .milurc.json 버전 레코드 갱신 완료");
}
