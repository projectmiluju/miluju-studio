/**
 * 평가 러너
 *
 * 평가 케이스를 병렬 실행하고 결과를 집계합니다.
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runEvalCase } from "./judge.js";
import type {
  EvalCase,
  EvalConfig,
  EvalResult,
  EvalRunSummary,
} from "./types.js";

/**
 * 스킬 마크다운 파일을 읽어 반환합니다.
 * dist/skills/claude-code/ 에서 빌드된 최종본을 사용합니다.
 */
async function loadSkillContent(
  projectRoot: string,
  skillName: string
): Promise<string> {
  // 먼저 dist에서 빌드된 버전을 시도
  const distPath = join(
    projectRoot,
    "dist",
    "skills",
    "claude-code",
    `${skillName}.md`
  );

  try {
    return await readFile(distPath, "utf-8");
  } catch {
    // dist가 없으면 원본 사용
    const srcPath = join(projectRoot, "skills", `${skillName}.md`);
    return readFile(srcPath, "utf-8");
  }
}

/**
 * 동시성 제한 Promise 풀
 */
async function pooledMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();

  for (const [index, item] of items.entries()) {
    const promise = fn(item).then((result) => {
      results[index] = result;
    });

    const tracked = promise.then(() => {
      executing.delete(tracked);
    });
    executing.add(tracked);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * 평가 케이스 목록을 실행하고 결과를 집계합니다.
 */
export async function runEvalSuite(
  cases: EvalCase[],
  config: EvalConfig
): Promise<EvalRunSummary> {
  const projectRoot = resolve(import.meta.dirname, "../..");
  const startTime = Date.now();

  // 스킬 필터 적용
  const filtered =
    config.skillFilter.length > 0
      ? cases.filter((c) => config.skillFilter.includes(c.skill))
      : cases;

  console.log(`\n🧪 miluju 스킬 평가 시작`);
  console.log(`   모델: ${config.model}`);
  console.log(`   케이스: ${filtered.length}개`);
  console.log(`   동시성: ${config.concurrency}`);
  console.log(`   통과 기준: ${config.passThreshold}/5.0`);
  console.log("");

  // 스킬 콘텐츠 사전 로드
  const skillNames = [...new Set(filtered.map((c) => c.skill))];
  const skillContents = new Map<string, string>();

  for (const name of skillNames) {
    const content = await loadSkillContent(projectRoot, name);
    skillContents.set(name, content);
  }

  // 병렬 평가 실행
  const results = await pooledMap(
    filtered,
    config.concurrency,
    async (evalCase) => {
      const skillContent = skillContents.get(evalCase.skill) ?? "";
      console.log(`  ⏳ ${evalCase.id} 평가 중...`);

      const result = await runEvalCase(evalCase, skillContent, config);

      const icon = result.pass ? "✅" : "❌";
      console.log(
        `  ${icon} ${evalCase.id}: ${result.weightedScore.toFixed(1)}/5.0 (${result.durationMs}ms)`
      );

      return result;
    }
  );

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const averageScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.weightedScore, 0) / results.length
      : 0;

  return {
    timestamp: new Date().toISOString(),
    totalCases: results.length,
    passed,
    failed,
    averageScore,
    results,
    model: config.model,
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * 평가 결과를 콘솔에 보고합니다.
 */
export function reportEvalResults(summary: EvalRunSummary): void {
  console.log("\n" + "=".repeat(60));
  console.log("📊 평가 결과 요약");
  console.log("=".repeat(60));

  console.log(`\n  모델: ${summary.model}`);
  console.log(`  전체: ${summary.totalCases}개 케이스`);
  console.log(`  통과: ${summary.passed}개 ✅`);
  console.log(`  실패: ${summary.failed}개 ❌`);
  console.log(`  평균 점수: ${summary.averageScore.toFixed(2)}/5.0`);
  console.log(`  총 소요 시간: ${(summary.totalDurationMs / 1000).toFixed(1)}초`);

  // 스킬별 그룹 보고
  const bySkill = new Map<string, EvalResult[]>();
  for (const r of summary.results) {
    const list = bySkill.get(r.skill) ?? [];
    list.push(r);
    bySkill.set(r.skill, list);
  }

  console.log("\n  ─── 스킬별 점수 ───");
  for (const [skill, results] of bySkill) {
    const avg =
      results.reduce((s, r) => s + r.weightedScore, 0) / results.length;
    const allPass = results.every((r) => r.pass);
    const icon = allPass ? "✅" : "⚠️";
    console.log(`  ${icon} ${skill}: ${avg.toFixed(2)}/5.0 (${results.length}개 케이스)`);
  }

  // 실패 케이스 상세
  const failures = summary.results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.log("\n  ─── 실패 케이스 상세 ───");
    for (const f of failures) {
      console.log(`\n  ❌ ${f.caseId} (${f.weightedScore.toFixed(1)}/5.0)`);
      if (!f.keywordPass) console.log(`     필수 키워드 누락`);
      if (!f.forbiddenPass) console.log(`     금지 키워드 포함`);
      for (const s of f.scores) {
        if (s.score <= 2) {
          console.log(`     • ${s.criterion}: ${s.score}/5 — ${s.reasoning}`);
        }
      }
    }
  }

  console.log("\n" + "=".repeat(60));
}
