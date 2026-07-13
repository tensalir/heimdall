#!/usr/bin/env node
import { Command } from 'commander'

import { runAuthor } from './author/runner.js'
import { runExtract } from './extract/runner.js'
import { runTranslate } from './translate/runner.js'

const program = new Command()
program
  .name('loop-playbook-migration')
  .description('SharePoint -> Google Sites migration pipeline for the Loop Earplugs playbook.')
  .version('0.1.0')

program
  .command('extract')
  .description('Pull pages from SharePoint via Microsoft Graph; emit pages/<slug>.{json,md} and assets/.')
  .option('-p, --page <titleOrSlug>', 'Extract only the page whose title or slug matches this string')
  .option('--skip-images', 'Skip image downloads (faster iteration on extraction logic)')
  .action(async (opts) => {
    await runExtract({ page: opts.page, skipImages: opts.skipImages === true })
  })

program
  .command('translate')
  .description('Run pages/<slug>.json through the loop-playbook-migration skill; emit output/<slug>.plan.{json,md}.')
  .option('-p, --page <titleOrSlug>', 'Translate only the page whose title or slug matches this string')
  .action(async (opts) => {
    await runTranslate({ page: opts.page })
  })

program
  .command('author')
  .description('Drive the New Google Sites editor with Playwright; one draft per plan.')
  .option('-p, --page <titleOrSlug>', 'Author only the page whose title or slug matches this string')
  .option('--dry-run', 'Emit output/<slug>.preview.md only; never touch Sites')
  .option('--headless', 'Run the browser headless (default: false on first run so you can sign in)')
  .action(async (opts) => {
    await runAuthor({
      page: opts.page,
      dryRun: opts.dryRun === true,
      headless: opts.headless === true,
    })
  })

program
  .command('run-all')
  .description('extract -> translate -> author for a single page (or all pages if --page is omitted).')
  .option('-p, --page <titleOrSlug>', 'Limit to a single page')
  .option('--dry-run', 'Stop before authoring; emit a dry-run preview instead')
  .action(async (opts) => {
    await runExtract({ page: opts.page })
    await runTranslate({ page: opts.page })
    await runAuthor({ page: opts.page, dryRun: opts.dryRun === true })
  })

program.parseAsync(process.argv).catch((err) => {
  console.error(`\n[fatal] ${(err as Error).message}\n`)
  process.exitCode = 1
})
