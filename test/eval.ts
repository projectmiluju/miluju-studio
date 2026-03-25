#!/usr/bin/env bun
/**
 * miluju-studio 스킬 평가 CLI
 *
 * 사용법:
 *   bun run eval                    전체 평가
 *   bun run eval --skill spec       특정 스킬만 평가
 *   bun run eval --model claude-haiku-4-5-20251001  모델 변경
 *   bun run eval --save             결과를 test/results/ 에 저장
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ALL_EVAL_CASES } from "./cases/index.js";
import { runEvalSuite, reportEvalResults } from "./lib/runner.js";
import { DEFAULT_EVAL_CONFIG, type EvalConfig } from "./lib/types.js";

function parseArgs(argv: string[]): {
  config: EvalConfig;
  save: boolean;
} {
  const config: EvalConfig = { ...DEFAULT_EVAL_CONFIG };
  let save = false;

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--skill":
        config.skillFilter.push(argv[++i]);
        break;
      case "--model":
        config.model = argv[++i];
        break;
      case "--concurrency":
        config.concurrency = parseInt(argv[++i]) || 3;
        break;
      case "--threshold":
        config.passThreshold = parseFloat(argv[++i]) || 3.0;
        break;
      case "--save":
        save = true;
        break;
    }
  }

  return { config, save };
}

async function main(): Promise<void> {
  const { config, save } = parseArgs(process.argv.slice(2));

  // API 키 확인
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY 환경 변수가 설정되지 않았습니다.");
    console.error("   export ANTHROPIC_API_KEY=sk-ant-...");
    process.exit(1);
  }

  const summary = await runEvalSuite(ALL_EVAL_CASES, config);
  reportEvalResults(summary);

  if (save) {
    const resultsDir = resolve(import.meta.dirname, "results");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = resolve(resultsDir, `eval-${timestamp}.json`);

    // 응답 본문은 너무 크므로 요약만 저장
    const saveable = {
      ...summary,
      results: summary.results.map((r) => ({
        ...r,
        response: r.response.slice(0, 500) + (r.response.length > 500 ? "..." : ""),
      })),
    };

    await writeFile(filePath, JSON.stringify(saveable, null, 2), "utf-8");
    console.log(`\n💾 결과 저장: ${filePath}`);
  }

  // 실패 시 종료 코드 1
  if (summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error("❌ 평가 실행 오류:", error);
  process.exit(1);
});
