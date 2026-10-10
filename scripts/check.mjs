#!/usr/bin/env node
/**
 * Repository self-check: the DSH manifest, the bundle patch, the client module
 * id, both locale dictionaries, and the icon must agree with the package name.
 *
 * Dependency-free on purpose, so CI needs no install step.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

/** Record a failed expectation. */
const expect = (condition, message) => {
  if (!condition) failures.push(message)
}

/** Read one repository file as UTF-8. */
const read = (relative) => readFileSync(path.join(root, relative), 'utf8')

/** Read a JSON file, recording a parse failure instead of throwing. */
const readJson = (relative) => {
  try {
    return JSON.parse(read(relative))
  } catch (error) {
    failures.push(`${relative} is not valid JSON: ${error.message}`)
    return undefined
  }
}

/** Whether a repository path exists, following the `files` glob convention. */
const exists = (relative) => {
  if (!relative.includes('*')) {
    try {
      statSync(path.join(root, relative))
      return true
    } catch {
      return false
    }
  }
  const [directory, pattern] = [path.dirname(relative), path.basename(relative)]
  try {
    const suffix = pattern.replace(/^\*/, '')
    return readdirSync(path.join(root, directory)).some((entry) => entry.endsWith(suffix))
  } catch {
    return false
  }
}

const manifest = readJson('package.json')
if (manifest !== undefined) {
  const name = manifest.name
  expect(typeof name === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(name), 'package.json name must be a publishable npm name')
  expect(manifest.license === 'MIT', 'package.json must declare the MIT license')
  expect(manifest.type === 'module', 'package.json must be an ES module package')

  const patch = manifest.dsh?.bundle?.patch
  expect(typeof patch === 'string', 'package.json must declare dsh.bundle.patch')
  if (typeof patch === 'string') expect(exists(patch), `dsh.bundle.patch ${patch} does not exist`)

  expect(manifest.dsh?.client?.platform === 'web', 'package.json must declare dsh.client.platform web')
  const clientExport = manifest.exports?.['./client']
  expect(typeof clientExport === 'string', 'package.json must export ./client')
  if (typeof clientExport === 'string') expect(exists(clientExport), `exports["./client"] ${clientExport} does not exist`)
  expect(exists('index.js'), 'index.js does not exist')
  expect(exists('locale/*.json'), 'locale dictionaries do not exist')
  expect(exists('icon.svg'), 'icon.svg does not exist')

  for (const entry of manifest.files ?? []) {
    expect(exists(entry), `files entry ${entry} does not exist`)
  }

  if (typeof name === 'string') {
    const client = read('client.js')
    expect(client.includes(`id: '${name}'`), `client.js must load the module id ${name}`)
    const row = new RegExp(`^\\s*-\\s*id: coding-plan-balance\\n\\s*name: '${name}'$`, 'm')
    expect(row.test(read(patch ?? 'cordis.patch.yml')), `cordis.patch.yml must insert a row named ${name}`)

    for (const locale of ['zh', 'en']) {
      const dictionary = readJson(`locale/${locale}.json`)
      expect(typeof dictionary?.meta?.title === 'string' && dictionary.meta.title !== '', `locale/${locale}.json needs meta.title`)
      expect(typeof dictionary?.meta?.description === 'string' && dictionary.meta.description !== '', `locale/${locale}.json needs meta.description`)
    }

    for (const [key, target] of Object.entries(manifest.exports ?? {})) {
      expect(exists(target), `exports["${key}"] target ${target} does not exist`)
    }
  }
}

const host = read('index.js')
expect(host.includes('export function apply'), 'index.js must export apply()')
expect(host.includes('export const inject'), 'index.js must declare the services it injects')

const icon = read('icon.svg')
expect(icon.trimStart().startsWith('<svg'), 'icon.svg must start with an <svg> root element')
expect(icon.includes('viewBox'), 'icon.svg must declare a viewBox')
expect(Buffer.byteLength(icon) <= 256 * 1024, 'icon.svg must stay under the 256 KiB icon limit')

if (failures.length > 0) {
  console.error(`check failed with ${failures.length} problem(s):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('check passed: manifest, patch, client id, locales, and icon agree')
