#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * cubemx2-translator —— STM32CubeMX2 多语言本地化工具。
 *
 * 与 STMicroelectronics 无关联。详见 DISCLAIMER.md。
 */
import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { locate, locateAll, InstallationNotFoundError } from './locate.js';
import { SourceMapIndex } from './extract/sourcemap.js';
import { BundleScanner } from './extract/bundle-scan.js';
import { buildCatalog } from './extract/catalog.js';
import { renderReport } from './catalog/report.js';
import {
  catalogToPot,
  mergePo,
  serializePo,
  parsePo,
  poStats,
  poToRuntimeTable,
  pseudoTable,
} from './catalog/po.js';
import { install as doInstall, rollback as doRollbackCmd, doctor as doDoctor } from './apply/index.js';
import {
  installPack,
  listInstalled,
  removePack,
  detectApiVersion,
  userPluginsDir,
} from './apply/langpack.js';
import { parseLegacyCsv, importLegacy } from './catalog/import-legacy.js';
import { lintPo, formatReport, type Glossary } from './catalog/lint.js';
import { buildWorkBatches, normalizeIncoming, applyWork } from './catalog/work.js';
import type { Catalog } from './types.js';

const program = new Command();

program
  .name('cubemx2-translator')
  .description('STM32CubeMX2 多语言本地化工具（社区项目，与 STMicroelectronics 无关联）')
  .version('0.1.0')
  .option('-a, --app <path>', 'STM32CubeMX2 安装目录（默认自动探测）')
  .option('-C, --catalog <path>', 'catalog.json 路径', 'catalog/catalog.json')
  .option('-L, --locales <dir>', '译文目录', 'locales');

function opts() {
  return program.opts<{ app?: string; catalog: string; locales: string }>();
}

function need(file: string, hint: string): string {
  if (!existsSync(file)) {
    console.error(`[错误] 未找到 ${file}\n       ${hint}`);
    process.exit(1);
  }
  return file;
}

function loadCatalog(file: string): Catalog {
  return JSON.parse(readFileSync(file, 'utf8')) as Catalog;
}

function ensureDir(file: string) {
  mkdirSync(path.dirname(file), { recursive: true });
}

/** 术语表：默认 locales/<locale>.glossary.json，没有就不做术语检查。 */
function loadGlossary(localesDir: string, locale: string, explicit?: string): Glossary | undefined {
  const p = explicit ?? path.join(localesDir, `${locale}.glossary.json`);
  if (!existsSync(p)) return undefined;
  return JSON.parse(readFileSync(p, 'utf8')) as Glossary;
}

/**
 * build / install 前的校验闸。
 * 有 error（占位符丢失、禁译词被改、首尾空格丢失……）就拒绝，因为这些会让界面文案失真；
 * warning 与 style 不拦。确认无误可 --force。
 */
function lintGate(localesDir: string, locale: string, force: boolean | undefined): void {
  const poPath = path.join(localesDir, `${locale}.po`);
  if (!existsSync(poPath)) return;
  const report = lintPo(parsePo(readFileSync(poPath)), {
    locale,
    glossary: loadGlossary(localesDir, locale),
  });
  if (report.errors === 0) return;
  console.error(`[lint] ${locale}.po 有 ${report.errors} 处错误，会让界面文案失真。`);
  console.error(`       运行 lint --locale ${locale} 查看详情；确认无误可加 --force 跳过。`);
  if (!force) process.exit(1);
}

// ---------------------------------------------------------------- extract

program
  .command('extract')
  .description('从本机安装抽取界面文本，生成 catalog.json 与 .pot 模板')
  .option('--all-sources', '连同 Theia / 第三方源码一并抽取（默认只抽 ST 自研代码）')
  .option('--pot <path>', 'POT 输出路径', 'locales/stm32cubemx2.pot')
  .action((cmd: { allSources?: boolean; pot: string }) => {
    const o = opts();
    const install = locate(o.app);
    console.log(`安装: ${install.root}  (v${install.version})`);

    const base = existsSync(install.bundleOrig) ? install.bundleOrig : install.bundleJs;
    if (base === install.bundleOrig) {
      console.log('基准: bundle.js.orig（原始产物，避免受已有补丁影响）');
    }

    process.stdout.write('  解析 sourcemap… ');
    const map = SourceMapIndex.fromFile(install.bundleMap);
    console.log(`${map.sources.length} 个源文件`);

    process.stdout.write('  扫描产物字面量… ');
    const bundle = BundleScanner.fromFile(base);
    console.log(`${bundle.distinctLiterals} 个不同字面量`);

    process.stdout.write('  抽取并分类… ');
    const catalog = buildCatalog(map, bundle, install.version, {
      vendorOnly: !cmd.allSources,
    });
    console.log(`${catalog.stats.total} 条`);

    ensureDir(o.catalog);
    writeFileSync(o.catalog, JSON.stringify(catalog, null, 2), 'utf8');

    const pot = catalogToPot(catalog);
    ensureDir(cmd.pot);
    writeFileSync(cmd.pot, serializePo(pot));

    const s = catalog.stats;
    console.log(`\n可译 ${s.translatable} ・ 已排除 ${s.excluded} ・ 待复核 ${s.needsReview}`);
    console.log(`catalog: ${o.catalog}`);
    console.log(`模板:    ${cmd.pot}`);
    console.log(`\n下一步：cubemx2-translator sync --locale zh-CN  然后用 Poedit 翻译`);
  });

// ---------------------------------------------------------------- catalog

program
  .command('catalog')
  .description('生成开发者可查阅的文本清单（HTML）')
  .option('-o, --out <path>', '输出路径', 'catalog/index.html')
  .action((cmd: { out: string }) => {
    const o = opts();
    const catalog = loadCatalog(need(o.catalog, '先执行 extract'));
    ensureDir(cmd.out);
    writeFileSync(cmd.out, renderReport(catalog), 'utf8');
    console.log(`已生成 ${cmd.out}（${catalog.stats.total} 条，含全部被排除条目与理由）`);
  });

// ---------------------------------------------------------------- sync

program
  .command('sync')
  .description('用最新模板更新语言 PO 文件，保留已有译文')
  .requiredOption('--locale <locale>', '语言代码，如 zh-CN / ja / de')
  .option('--pot <path>', 'POT 模板路径', 'locales/stm32cubemx2.pot')
  .action((cmd: { locale: string; pot: string }) => {
    const o = opts();
    const potPath = need(cmd.pot, '先执行 extract');
    const pot = parsePo(readFileSync(potPath));
    pot.headers['Language'] = cmd.locale;

    const poPath = path.join(o.locales, `${cmd.locale}.po`);
    if (!existsSync(poPath)) {
      ensureDir(poPath);
      writeFileSync(poPath, serializePo(pot));
      const st = poStats(pot);
      console.log(`已新建 ${poPath}（${st.total} 条待翻译）`);
      return;
    }

    const existing = parsePo(readFileSync(poPath));
    const { merged, kept, added, dropped } = mergePo(pot, existing);
    writeFileSync(poPath, serializePo(merged));
    console.log(`已更新 ${poPath}：保留 ${kept} 条译文，新增 ${added} 条待翻译，移除 ${dropped} 条失效条目`);
  });

// ---------------------------------------------------------------- build

program
  .command('build')
  .description('把 PO 编译成运行时译文表')
  .requiredOption('--locale <locale>', '语言代码')
  .option('-o, --out <dir>', '输出目录', 'out')
  .option(
    '--pseudo',
    '生成伪翻译表（每条原文包成 ⟦原文⟧）。不读 PO，直接由 catalog 生成，' +
      '用于验证挂钩是否生效、界面上还有哪些文案没被覆盖',
  )
  .option('--force', '即使 lint 有错误也继续')
  .action((cmd: { locale: string; out: string; pseudo?: boolean; force?: boolean }) => {
    const o = opts();
    mkdirSync(cmd.out, { recursive: true });
    const outFile = path.join(cmd.out, `${cmd.locale.toLowerCase()}.json`);

    if (cmd.pseudo) {
      const catalog = loadCatalog(need(o.catalog, '先执行 extract'));
      const table = pseudoTable(catalog, cmd.locale);
      writeFileSync(outFile, JSON.stringify(table), 'utf8');
      console.log(`${outFile}：伪翻译 ${Object.keys(table.strings).length} 条`);
      console.log('界面上带 ⟦⟧ 的即为已覆盖，裸英文即为覆盖缺口。');
      return;
    }

    const poPath = need(path.join(o.locales, `${cmd.locale}.po`), '先执行 sync 并翻译');
    lintGate(o.locales, cmd.locale, cmd.force);
    const data = parsePo(readFileSync(poPath));
    const table = poToRuntimeTable(data, cmd.locale);
    const st = poStats(data);
    writeFileSync(outFile, JSON.stringify(table), 'utf8');
    console.log(`${outFile}：${Object.keys(table.strings).length} 条译文（PO 完成度 ${st.translated}/${st.total}）`);
  });

// ---------------------------------------------------------------- install

program
  .command('install')
  .description('注入运行时并部署译文表')
  .option('--locale <locales>', '要部署的语言，逗号分隔', 'zh-CN')
  .option('--pseudo', '部署伪翻译而非真实译文，用于验证挂钩与覆盖率')
  .option('--force', '即使 lint 有错误也继续')
  .option('--dry-run', '只校验不写盘')
  .action((cmd: { locale: string; pseudo?: boolean; force?: boolean; dryRun?: boolean }) => {
    const o = opts();
    const install = locate(o.app);
    const locales = cmd.locale.split(',').map((s) => s.trim()).filter(Boolean);
    console.log(`安装: ${install.root}  (v${install.version})`);

    if (!cmd.pseudo) {
      for (const l of locales) lintGate(o.locales, l, cmd.force);
    }

    const r = doInstall(install, {
      locales,
      localesDir: o.locales,
      ...(cmd.pseudo ? { pseudoCatalog: loadCatalog(need(o.catalog, '先执行 extract')) } : {}),
      ...(cmd.dryRun ? { dryRun: true } : {}),
    });

    for (const d of r.deployed) {
      console.log(
        cmd.pseudo
          ? `  ${d.locale}: 伪翻译 ${d.translated} 条`
          : `  ${d.locale}: ${d.translated}/${d.entries} 条已翻译`,
      );
    }
    console.log(`  注入 ${r.sites} 处运行时包装，产物增加 ${r.bytesDelta} 字节`);
    console.log(`  index.html: ${r.htmlPatched === 'inserted' ? '已插入运行时加载' : '已存在加载行'}`);
    console.log(`  译文表目录: ${r.i18nPath}`);
    if (r.foreignPatch) {
      console.log(
        '\n[提示] 检测到其它汉化工具的补丁。本次以 bundle.js.orig 为基准重新注入，' +
          '未在其补丁上叠加——那套翻译不会再生效。',
      );
    }
    if (cmd.dryRun) {
      console.log('\n(dry-run，未写盘)');
      return;
    }
    console.log(
      `\n完成。启动 STM32CubeMX2，按 F1 执行 "Configure Display Language" 选择 ${locales[0]}，重载即可生效。\n` +
        '该命令写的是 Theia 自己的 localStorage.localeId，框架文案与 ST 文案会同时切换。\n' +
        `若该语言不在列表里，先执行 langpack install --locale ${locales[0]} 装框架语言包。`,
    );
  });

// ---------------------------------------------------------------- langpack

const langpack = program
  .command('langpack')
  .description('框架语言包（Tier 1）：激活 Theia 内置的 14 种语言，放在用户目录，不碰 ST 文件');

langpack
  .command('install')
  .description('从 Open VSX 下载微软官方 VS Code 语言包（MIT）到 Theia 用户插件目录')
  .requiredOption('--locale <locale>', '语言，如 zh-cn / zh-tw / ja / de / fr')
  .option('--version <ver>', '指定版本；默认取与应用 VS Code API 版本最匹配的')
  .option('--dry-run', '只解析与校验，不写盘')
  .action(async (cmd: { locale: string; version?: string; dryRun?: boolean }) => {
    const o = opts();
    const install = locate(o.app);
    const api = detectApiVersion(install);
    console.log(`安装: ${install.root}  (v${install.version})`);
    console.log(`应用内置 VS Code API: ${api ?? '未识别'}`);
    process.stdout.write('  解析版本并下载… ');

    const r = await installPack(install, cmd.locale, {
      ...(cmd.version ? { version: cmd.version } : {}),
      ...(cmd.dryRun ? { dryRun: true } : {}),
    });
    console.log(r.reused ? '已有同版本文件，跳过下载' : '完成');

    console.log(`  语言包   ${r.pack} ${r.version}${r.exact ? '' : '（非精确匹配）'}`);
    if (r.note) console.log(`  说明     ${r.note}`);
    console.log(`  许可证   ${r.license ?? '（Open VSX 未返回）'}`);
    console.log(`  翻译束   ${r.translations} 个`);
    console.log(`  位置     ${r.file}`);
    for (const old of r.removedOld) console.log(`  已移除旧版本 ${path.basename(old)}`);
    if (cmd.dryRun) {
      console.log('\n(dry-run，未写盘)');
      return;
    }
    console.log(
      `\n完成。重启 STM32CubeMX2，按 F1 执行 "Configure Display Language"，` +
        `${cmd.locale} 现在会出现在列表里；选择后菜单、编辑器、设置等框架文案即切换。`,
    );
  });

langpack
  .command('list')
  .description('列出用户插件目录里已装的语言包')
  .action(() => {
    const o = opts();
    const install = locate(o.app);
    const dir = userPluginsDir(install);
    const packs = listInstalled(install);
    console.log(`用户插件目录: ${dir}`);
    if (!packs.length) {
      console.log('（没有语言包）');
      return;
    }
    for (const p of packs) console.log(`  ${(p.locale ?? '?').padEnd(6)} ${p.pack} ${p.version}`);
  });

langpack
  .command('remove')
  .description('移除某语言的语言包')
  .requiredOption('--locale <locale>', '语言')
  .action((cmd: { locale: string }) => {
    const o = opts();
    const install = locate(o.app);
    const removed = removePack(install, cmd.locale);
    if (!removed.length) console.log(`没有装 ${cmd.locale} 的语言包`);
    for (const f of removed) console.log(`已移除 ${f}`);
  });

// ---------------------------------------------------------------- rollback

program
  .command('rollback')
  .description('还原 bundle.js 与 index.html')
  .action(() => {
    const o = opts();
    const install = locate(o.app);
    const r = doRollbackCmd(install);
    console.log(`bundle.js: ${r.bundle ? '已还原' : '无备份可还原'}`);
    console.log(`index.html: ${r.html ? '已还原' : '无备份可还原'}`);
    if (!r.hadInjection) console.log('（原本就没有本工具的注入）');
  });

// ---------------------------------------------------------------- doctor

program
  .command('doctor')
  .description('体检：安装、备份、注入状态、译文表')
  .action(() => {
    const o = opts();
    const all = locateAll();
    if (all.length > 1) {
      console.log(`找到 ${all.length} 个安装：`);
      for (const i of all) console.log(`  v${i.version}  ${i.root}`);
      console.log('');
    }
    const install = locate(o.app);
    const d = doDoctor(install);
    const yn = (b: boolean) => (b ? '是' : '否');

    console.log(`安装目录     ${d.install.root}`);
    console.log(`应用版本     ${d.install.version}`);
    console.log(`bundle.js    ${d.bundleBytes} 字节`);
    console.log(`.orig 备份   ${yn(d.origPresent)}`);
    console.log(`本工具备份   ${yn(d.ourBackupPresent)}`);
    console.log(`已注入       ${yn(d.injected)}`);
    console.log(`index.html   ${yn(d.htmlPatched)}`);
    console.log(`运行时文件   ${yn(d.runtimePresent)}`);
    console.log(`译文表       ${d.i18nFiles.length ? d.i18nFiles.join(', ') : '（无）'}`);
    console.log(`bundle.js.gz ${d.gzPresent ? (d.gzStale ? '存在但已过期' : '存在且同步') : '不存在'}`);
    const packs = listInstalled(install);
    console.log(
      `框架语言包   ${packs.length ? packs.map((p) => `${p.locale ?? p.pack} ${p.version}`).join(', ') : '（无，框架文案将保持英文）'}`,
    );
    if (d.notes.length) {
      console.log('');
      for (const n of d.notes) console.log(`[注意] ${n}`);
    }
  });

// ---------------------------------------------------------------- import-legacy

program
  .command('import-legacy')
  .description('从旧项目的 CSV 工作表导入译文（默认只导入使用者自译的部分）')
  .requiredOption('--csv <path>', '旧项目的 manual-translate.csv')
  .requiredOption('--locale <locale>', '导入到哪个语言的 PO')
  .option(
    '--include-foreign',
    '连同 from_dict=1 的行一并导入。那些是他人词典的翻译成果，' +
      '来源项目未声明开源许可证，导入后产出的 PO 不可公开分发',
  )
  .action((cmd: { csv: string; locale: string; includeForeign?: boolean }) => {
    const o = opts();
    const csvPath = need(cmd.csv, '检查路径是否正确');
    const poPath = need(path.join(o.locales, `${cmd.locale}.po`), '先执行 sync');

    const legacy = parseLegacyCsv(readFileSync(csvPath, 'utf8'));
    const po = parsePo(readFileSync(poPath));
    const r = importLegacy(po, legacy, cmd.includeForeign ? { includeForeign: true } : {});
    writeFileSync(poPath, serializePo(po));

    console.log(`旧表 ${r.total} 行`);
    console.log(`  可用候选（自译）     ${r.eligible}`);
    if (!cmd.includeForeign) {
      console.log(`  因来源存疑跳过       ${r.foreignSkipped}  (from_dict=1，属他人词典成果)`);
    }
    console.log(`  已填入 PO            ${r.applied}`);
    console.log(`  PO 中已有译文未覆盖  ${r.alreadyTranslated}`);
    console.log(`  旧表有、新目录无     ${r.unmatched}`);
    const st = poStats(po);
    console.log(`\n${poPath}：完成度 ${st.translated}/${st.total}`);
    if (cmd.includeForeign) {
      console.log('\n[警告] 已包含来源存疑的译文，该 PO 不可公开分发。');
    }
  });

// ---------------------------------------------------------------- lint

program
  .command('lint')
  .description('校验 PO 译文：占位符、禁译词、首尾空格、助记符、术语、中文标点')
  .requiredOption('--locale <locale>', '语言代码')
  .option('--glossary <path>', '术语表 JSON（默认 locales/<locale>.glossary.json）')
  .option('--json', '以 JSON 输出，供程序或翻译 AI 消费')
  .option('--strict', '警告也视为失败')
  .option('--max <n>', '最多显示多少条', '200')
  .action((cmd: { locale: string; glossary?: string; json?: boolean; strict?: boolean; max: string }) => {
    const o = opts();
    const poPath = need(path.join(o.locales, `${cmd.locale}.po`), '先执行 sync');
    const report = lintPo(parsePo(readFileSync(poPath)), {
      locale: cmd.locale,
      glossary: loadGlossary(o.locales, cmd.locale, cmd.glossary),
    });
    if (cmd.json) console.log(JSON.stringify(report, null, 2));
    else console.log(formatReport(report, { max: parseInt(cmd.max, 10) || 200 }));
    const failed = report.errors > 0 || (!!cmd.strict && report.warnings > 0);
    process.exit(failed ? 1 : 0);
  });

// ---------------------------------------------------------------- export-work

program
  .command('export-work')
  .description('把待翻译条目打包成 JSON 批次，交给翻译人员或 AI')
  .requiredOption('--locale <locale>', '语言代码')
  .option('-o, --out <dir>', '输出目录', 'work')
  .option('--batch-size <n>', '每批条数', '60')
  .option('--include-translated', '连同已翻译的条目一起导出，用于复核')
  .action((cmd: { locale: string; out: string; batchSize: string; includeTranslated?: boolean }) => {
    const o = opts();
    const poPath = need(path.join(o.locales, `${cmd.locale}.po`), '先执行 sync');
    const batches = buildWorkBatches(parsePo(readFileSync(poPath)), {
      locale: cmd.locale,
      batchSize: parseInt(cmd.batchSize, 10) || 60,
      includeTranslated: !!cmd.includeTranslated,
    });
    const dir = path.join(cmd.out, cmd.locale);
    mkdirSync(dir, { recursive: true });
    for (const b of batches) {
      const file = path.join(dir, `batch-${String(b.batch).padStart(3, '0')}.json`);
      writeFileSync(file, JSON.stringify(b, null, 2), 'utf8');
    }
    const total = batches.reduce((n, b) => n + b.count, 0);
    console.log(`已导出 ${batches.length} 个批次，共 ${total} 条 → ${dir}${path.sep}`);
    console.log('交接说明见 TRANSLATION_HANDOFF.md；翻译方交回后用 import-json 导入。');
  });

// ---------------------------------------------------------------- import-json

program
  .command('import-json')
  .description('把翻译方交回的 JSON 灌回 PO，并立即校验')
  .requiredOption('--locale <locale>', '语言代码')
  .requiredOption('--from <paths...>', '文件或目录，可多个')
  .option('--overwrite', '覆盖 PO 里已有的译文（默认只填空的）')
  .option('--source <name>', '记录译者来源（如 claude / gpt），写进 PO 注释便于复核')
  .action((cmd: { locale: string; from: string[]; overwrite?: boolean; source?: string }) => {
    const o = opts();
    const poPath = need(path.join(o.locales, `${cmd.locale}.po`), '先执行 sync');

    const files: string[] = [];
    for (const p of cmd.from) {
      if (!existsSync(p)) {
        console.error(`[错误] 未找到 ${p}`);
        process.exit(1);
      }
      if (statSync(p).isDirectory()) {
        for (const f of readdirSync(p).sort()) if (f.endsWith('.json')) files.push(path.join(p, f));
      } else files.push(p);
    }

    const incoming: { msgid: string; msgstr: string }[] = [];
    for (const f of files) {
      try {
        incoming.push(...normalizeIncoming(JSON.parse(readFileSync(f, 'utf8'))));
      } catch (e) {
        console.error(`[错误] ${f} 不是合法 JSON：${(e as Error).message}`);
        process.exit(1);
      }
    }

    const data = parsePo(readFileSync(poPath));
    const r = applyWork(data, incoming, {
      ...(cmd.overwrite ? { overwrite: true } : {}),
      ...(cmd.source ? { source: cmd.source } : {}),
    });
    writeFileSync(poPath, serializePo(data));

    console.log(`读取 ${files.length} 个文件，${incoming.length} 条`);
    console.log(`  已填入            ${r.applied}`);
    console.log(`  PO 已有译文，跳过 ${r.skippedExisting}${r.skippedExisting ? '（--overwrite 可覆盖）' : ''}`);
    console.log(`  译文为空，跳过    ${r.emptyInput}`);
    if (r.unknown.length) {
      console.log(`  原文不在 PO 里    ${r.unknown.length}（msgid 被改动过？）`);
      for (const u of r.unknown.slice(0, 5)) console.log(`     ${JSON.stringify(u.slice(0, 80))}`);
    }

    const report = lintPo(data, { locale: cmd.locale, glossary: loadGlossary(o.locales, cmd.locale) });
    console.log('');
    console.log(formatReport(report, { max: 40 }));
    if (report.errors) {
      console.log(`\n有 ${report.errors} 处错误，修正后才能 build / install。lint --json 可导出给翻译方。`);
    }
  });

// ---------------------------------------------------------------- audit

program
  .command('audit')
  .description('说明如何实测运行时翻译覆盖率')
  .action(() => {
    console.log(`实测覆盖率（需要应用已 install 并切到目标语言）：

  1. 在 STM32CubeMX2 里打开开发者工具（Help → Toggle Developer Tools）
  2. 控制台执行，开启审计并重载：

       localStorage.setItem('cubemx2TranslatorAudit', '1'); location.reload()

  3. 正常操作一遍主要界面（工程创建、Pinout、时钟、Pack 管理、代码生成…）
  4. 回到控制台导出仍是英文的文案：

       copy(JSON.stringify(window.__CUBEMX2_I18N__.report(), null, 2))

  5. 粘贴保存为 audit.json。其中 missing 列出界面上出现过、
     但译文表里没有的英文——这就是抽取还没覆盖到的部分。

  关掉审计：localStorage.removeItem('cubemx2TranslatorAudit')`);
  });

// ---------------------------------------------------------------- main

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (e) {
    if (e instanceof InstallationNotFoundError) {
      console.error(`[错误] ${e.message}`);
    } else {
      console.error(`[错误] ${(e as Error).message}`);
    }
    process.exit(1);
  }
}

void main();
