#!/usr/bin/env node
/**
 * cubemx2-translator —— STM32CubeMX2 多语言本地化工具。
 *
 * 与 STMicroelectronics 无关联。详见 NOTICE。
 */
import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
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
} from './catalog/po.js';
import { install as doInstall, rollback as doRollbackCmd, doctor as doDoctor } from './apply/index.js';
import { parseLegacyCsv, importLegacy } from './catalog/import-legacy.js';
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
  .action((cmd: { locale: string; out: string }) => {
    const o = opts();
    const poPath = need(path.join(o.locales, `${cmd.locale}.po`), '先执行 sync 并翻译');
    const data = parsePo(readFileSync(poPath));
    const table = poToRuntimeTable(data, cmd.locale);
    const st = poStats(data);
    mkdirSync(cmd.out, { recursive: true });
    const outFile = path.join(cmd.out, `${cmd.locale}.json`);
    writeFileSync(outFile, JSON.stringify(table), 'utf8');
    console.log(`${outFile}：${Object.keys(table.strings).length} 条译文（PO 完成度 ${st.translated}/${st.total}）`);
  });

// ---------------------------------------------------------------- install

program
  .command('install')
  .description('注入运行时并部署译文表')
  .option('--locale <locales>', '要部署的语言，逗号分隔', 'zh-CN')
  .option('--dry-run', '只校验不写盘')
  .action((cmd: { locale: string; dryRun?: boolean }) => {
    const o = opts();
    const install = locate(o.app);
    const locales = cmd.locale.split(',').map((s) => s.trim()).filter(Boolean);
    console.log(`安装: ${install.root}  (v${install.version})`);

    const r = doInstall(install, {
      locales,
      localesDir: o.locales,
      ...(cmd.dryRun ? { dryRun: true } : {}),
    });

    for (const d of r.deployed) {
      console.log(`  ${d.locale}: ${d.translated}/${d.entries} 条已翻译`);
    }
    console.log(`  注入 2 处运行时包装，产物增加 ${r.bytesDelta} 字节`);
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
        '该命令写的是 Theia 自己的 localStorage.localeId，框架文案与 ST 文案会同时切换。',
    );
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
