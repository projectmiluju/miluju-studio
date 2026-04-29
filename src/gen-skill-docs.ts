#!/usr/bin/env bun
/**
 * miluju-studio 스킬 생성기
 *
 * skills/ 디렉토리의 마크다운 스킬 파일을 읽어,
 * 각 AI 에이전트(Claude Code, Cursor, Gemini)에 맞는 형식으로 변환합니다.
 *
 * 사용법: bun run gen
 * 출력:   dist/skills/{agent}/{skill}.md
 */

import { resolve } from "node:path";
import { loadBase, loadSkills, mergeBaseIntoSkill } from "./lib/parser.js";
import {
  AGENT_TARGETS,
  transformForAgent,
} from "./lib/transformer.js";
import {
  writeSkill,
  reportResults,
  type GenerationResult,
} from "./lib/writer.js";

async function main(): Promise<void> {
  const projectRoot = resolve(import.meta.dirname, "..");
  const skillsDir = resolve(projectRoot, "skills");
  const outDir = resolve(projectRoot, "dist");

  console.log("🚀 miluju-studio 스킬 생성기를 시작합니다.");
  console.log(`   입력: ${skillsDir}`);
  console.log(`   출력: ${outDir}/skills/{agent}/`);

  // 1. _base.md 로드
  const baseBody = await loadBase(skillsDir);
  console.log(`\n✅ _base.md 로드 완료`);

  // 2. 스킬 파일 로드
  const skills = await loadSkills(skillsDir);
  console.log(
    `✅ ${skills.length}개 스킬 로드: ${skills.map((s) => s.name).join(", ")}`
  );

  // 3. 에이전트별 변환 + 출력
  const results: GenerationResult[] = [];

  for (const target of AGENT_TARGETS) {
    for (const skill of skills) {
      // _base.md를 스킬에 인라인 병합
      const merged = mergeBaseIntoSkill(baseBody, skill);

      // 에이전트별 변환
      const transformed = transformForAgent(
        merged,
        target,
        skill.name,
        skill.meta.version
      );

      // 파일 출력
      const path = await writeSkill(outDir, target, skill.name, transformed);
      results.push({ agent: target, skill: skill.name, path });
    }
  }

  // 4. 결과 보고
  reportResults(results);
}

main().catch((error: unknown) => {
  console.error("❌ 스킬 생성 중 오류 발생:", error);
  process.exit(1);
});
