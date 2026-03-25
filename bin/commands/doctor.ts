/**
 * miluju doctor — 환경 진단 명령어
 *
 * miluju-studio 실행에 필요한 도구와 설정 상태를 점검합니다.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

async function checkCommand(cmd: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["sh", "-c", `${cmd} 2>/dev/null`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    return exitCode === 0 ? output.trim() : null;
  } catch {
    return null;
  }
}

export async function runDoctor(targetDir: string): Promise<void> {
  console.log("🩺 miluju-studio 환경 진단\n");

  const results: CheckResult[] = [];

  // 1. Bun 설치 확인
  const bunVersion = await checkCommand("bun --version");
  if (bunVersion) {
    results.push({ name: "Bun", status: "pass", message: `v${bunVersion}` });
  } else {
    results.push({ name: "Bun", status: "fail", message: "설치되지 않음 → curl -fsSL https://bun.sh/install | bash" });
  }

  // 2. Node.js 확인 (선택)
  const nodeVersion = await checkCommand("node --version");
  if (nodeVersion) {
    results.push({ name: "Node.js", status: "pass", message: nodeVersion });
  } else {
    results.push({ name: "Node.js", status: "warn", message: "설치되지 않음 (Bun 사용 시 선택사항)" });
  }

  // 3. Git 확인
  const gitVersion = await checkCommand("git --version");
  if (gitVersion) {
    results.push({ name: "Git", status: "pass", message: gitVersion });
  } else {
    results.push({ name: "Git", status: "fail", message: "설치되지 않음" });
  }

  // 4. Playwright 브라우저 확인
  const playwrightCheck = await checkCommand("bunx playwright install --dry-run chromium");
  if (playwrightCheck !== null) {
    results.push({ name: "Playwright Chromium", status: "pass", message: "설치됨" });
  } else {
    // dry-run 실패 시 직접 확인
    const chromiumPath = await checkCommand("bunx playwright install --list");
    if (chromiumPath?.includes("chromium")) {
      results.push({ name: "Playwright Chromium", status: "pass", message: "설치됨" });
    } else {
      results.push({ name: "Playwright Chromium", status: "warn", message: "미설치 → bunx playwright install chromium" });
    }
  }

  // 5. ANTHROPIC_API_KEY 확인 (Eval용)
  if (process.env.ANTHROPIC_API_KEY) {
    const masked = process.env.ANTHROPIC_API_KEY.slice(0, 10) + "...";
    results.push({ name: "ANTHROPIC_API_KEY", status: "pass", message: masked });
  } else {
    results.push({ name: "ANTHROPIC_API_KEY", status: "warn", message: "미설정 (eval 명령어에 필요)" });
  }

  // 6. package.json 확인
  const pkgPath = join(targetDir, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    results.push({ name: "package.json", status: "pass", message: `${pkg.name}@${pkg.version}` });
  } else {
    results.push({ name: "package.json", status: "fail", message: "없음 → miluju init 실행 필요" });
  }

  // 7. node_modules 확인
  if (existsSync(join(targetDir, "node_modules"))) {
    results.push({ name: "node_modules", status: "pass", message: "설치됨" });
  } else {
    results.push({ name: "node_modules", status: "fail", message: "없음 → bun install 실행 필요" });
  }

  // 8. skills/ 디렉토리 확인
  const skillsDir = join(targetDir, "skills");
  if (existsSync(skillsDir)) {
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(skillsDir)).filter((f) => f.endsWith(".md"));
    results.push({ name: "skills/", status: "pass", message: `${files.length}개 스킬 파일` });
  } else {
    results.push({ name: "skills/", status: "warn", message: "없음" });
  }

  // 9. dist/ 빌드 확인
  if (existsSync(join(targetDir, "dist", "skills"))) {
    results.push({ name: "dist/skills/", status: "pass", message: "빌드됨" });
  } else {
    results.push({ name: "dist/skills/", status: "warn", message: "없음 → bun run gen 실행 필요" });
  }

  // 결과 출력
  const icons = { pass: "✅", warn: "⚠️", fail: "❌" };
  for (const r of results) {
    console.log(`  ${icons[r.status]} ${r.name}: ${r.message}`);
  }

  const failures = results.filter((r) => r.status === "fail");
  const warnings = results.filter((r) => r.status === "warn");

  console.log("");
  if (failures.length === 0 && warnings.length === 0) {
    console.log("🎉 모든 항목 정상!");
  } else if (failures.length === 0) {
    console.log(`⚠️  ${warnings.length}개 경고 (선택사항)`);
  } else {
    console.log(`❌ ${failures.length}개 필수 항목 실패, ${warnings.length}개 경고`);
    process.exit(1);
  }
}
