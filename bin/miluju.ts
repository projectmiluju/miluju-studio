#!/usr/bin/env bun
/**
 * miluju — CLI 진입점
 *
 * 사용법:
 *   miluju install --agent claude-code   현재 프로젝트에 스킬 설치
 *   miluju install                       모든 에이전트용 스킬 설치
 *   miluju doctor                        환경 진단
 *   miluju update-check                  버전 확인
 *   miluju help                          도움말
 */

import { resolve } from "node:path";
import { runInstall, getSupportedAgents } from "./commands/install.js";
import { runDoctor } from "./commands/doctor.js";
import { runUpdateCheck } from "./commands/update-check.js";
import { setAnalyticsEnabled, trackEvent } from "./lib/analytics.js";
import { AGENT_TARGETS, type AgentTarget } from "../src/lib/transformer.js";

const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`
miluju-studio v${VERSION}
1인 개발자를 위한 AI 에이전트 워크플로우 인프라

사용법:
  miluju <command> [options]

명령어:
  install              프로젝트에 스킬 파일 설치
    --agent <type>     에이전트 지정 [반복 가능]
                       지원: ${getSupportedAgents()}
                       미지정 시 전체 에이전트에 설치
    --target <path>    대상 프로젝트 경로 (기본: 현재 디렉토리)

  doctor               환경 진단 (Bun, Node, Git, Playwright 등)

  update-check         의존성 최신 버전 확인

  analytics on|off     텔레메트리 설정

  gen                  스킬 문서 생성 (= bun run gen)
  eval                 스킬 품질 평가 (= bun run eval)
  browse               브라우저 검수 서버 (= bun run browse)

  help                 이 도움말 표시
  version              버전 출력

사용 예시:
  # 다른 프로젝트에 Claude Code 스킬 설치
  bun run miluju install --agent claude-code --target ~/my-project

  # 현재 디렉토리에 Cursor + Windsurf 동시 설치
  bun run miluju install --agent cursor --agent windsurf

  # 모든 에이전트용 스킬 한 번에 설치
  bun run miluju install --target ~/my-project
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const projectDir = resolve(".");

  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "version" || command === "--version") {
    console.log(`miluju-studio v${VERSION}`);
    return;
  }

  // 텔레메트리 추적 (비활성화 시 무시됨)
  await trackEvent(projectDir, `cli:${command}`);

  switch (command) {
    case "install": {
      const agents: AgentTarget[] = [];
      let targetDir = projectDir;

      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--agent" && args[i + 1]) {
          const agent = args[++i];
          if (AGENT_TARGETS.includes(agent as AgentTarget)) {
            agents.push(agent as AgentTarget);
          } else {
            console.error(`❌ 알 수 없는 에이전트: ${agent}`);
            console.error(`   지원: ${getSupportedAgents()}`);
            process.exit(1);
          }
        } else if (args[i] === "--target" && args[i + 1]) {
          targetDir = resolve(args[++i]);
        }
      }

      // 미지정 시 전체 에이전트
      if (agents.length === 0) {
        agents.push(...AGENT_TARGETS);
      }

      await runInstall({ targetDir, agents });
      break;
    }

    case "doctor":
      await runDoctor(projectDir);
      break;

    case "update-check":
      await runUpdateCheck(projectDir);
      break;

    case "analytics": {
      const toggle = args[1];
      if (toggle === "on") {
        await setAnalyticsEnabled(projectDir, true);
      } else if (toggle === "off") {
        await setAnalyticsEnabled(projectDir, false);
      } else {
        console.error("사용법: miluju analytics on|off");
        process.exit(1);
      }
      break;
    }

    // bun run 명령어로 위임
    case "gen":
    case "eval":
    case "browse": {
      const proc = Bun.spawn(["bun", "run", command, ...args.slice(1)], {
        stdio: ["inherit", "inherit", "inherit"],
        cwd: projectDir,
      });
      const exitCode = await proc.exited;
      process.exit(exitCode);
      break;
    }

    // 하위 호환: init → install로 안내
    case "init":
      console.log("ℹ️  'init' 명령어는 'install'로 변경되었습니다.");
      console.log("   miluju install --agent claude-code");
      break;

    default:
      console.error(`❌ 알 수 없는 명령어: ${command}`);
      console.error("   miluju help 로 사용 가능한 명령어를 확인하세요.");
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error("❌ 오류:", error);
  process.exit(1);
});
