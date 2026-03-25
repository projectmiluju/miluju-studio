import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentTarget } from "./transformer.js";

/**
 * 변환된 스킬 문서를 에이전트별 디렉토리에 저장합니다.
 *
 * 출력 구조:
 *   dist/skills/claude-code/planner.md
 *   dist/skills/claude-code/designer.md
 *   dist/skills/cursor/planner.md
 *   ...
 */
export async function writeSkill(
  outDir: string,
  agent: AgentTarget,
  skillName: string,
  content: string
): Promise<string> {
  const dir = join(outDir, "skills", agent);
  await mkdir(dir, { recursive: true });

  const filePath = join(dir, `${skillName}.md`);
  await writeFile(filePath, content, "utf-8");

  return filePath;
}

/** 생성 결과 요약 */
export interface GenerationResult {
  agent: AgentTarget;
  skill: string;
  path: string;
}

/**
 * 생성 결과를 콘솔에 보고합니다.
 */
export function reportResults(results: GenerationResult[]): void {
  const byAgent = new Map<AgentTarget, GenerationResult[]>();

  for (const r of results) {
    const list = byAgent.get(r.agent) ?? [];
    list.push(r);
    byAgent.set(r.agent, list);
  }

  console.log("");
  console.log("📄 스킬 문서 생성 완료");
  console.log("=".repeat(50));

  for (const [agent, items] of byAgent) {
    console.log(`\n  🤖 ${agent} (${items.length}개 스킬)`);
    for (const item of items) {
      console.log(`     └─ ${item.path}`);
    }
  }

  console.log(`\n  합계: ${results.length}개 파일 생성`);
  console.log("");
}
