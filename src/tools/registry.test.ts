import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { tools } from './registry'

// Addresses the site already uses, which a tool's id mustn't take.
const TAKEN = ['index', '404', 'assets', 'licences']

describe('the tool registry', () => {
  it('lists at least one tool', () => {
    expect(tools.length).toBeGreaterThan(0)
  })

  it('gives every tool a unique, URL-safe id that no other page uses', () => {
    const ids = tools.map((tool) => tool.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(TAKEN).not.toContain(id)
    }
  })

  it('has a page and a manifest for every tool', () => {
    for (const { id } of tools) {
      for (const file of ['Tool.tsx', 'manifest.ts']) {
        const path = fileURLToPath(new URL(`./${id}/${file}`, import.meta.url))
        expect(existsSync(path), `${id}/${file}`).toBe(true)
      }
    }
  })

  it('describes every tool in one full sentence or two', () => {
    for (const tool of tools) {
      expect(tool.name.trim()).not.toBe('')
      expect(tool.description).toMatch(/^[A-Z].*\.$/)
    }
  })

  it('lists file types as lowercase extensions without dots', () => {
    for (const tool of tools) {
      for (const extension of tool.accepts) {
        expect(extension).toMatch(/^[a-z0-9]+$/)
      }
    }
  })
})
