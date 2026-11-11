import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { categories, tools } from './registry'

// Addresses the site already uses, which a tool's id mustn't take.
const TAKEN = ['index', '404', 'assets', 'licences', 'engines', 'privacy', 'og']

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

  it('puts every tool in a home page group, and leaves no group empty', () => {
    for (const tool of tools) expect(categories).toContain(tool.category)
    for (const category of categories) {
      expect(tools.some((tool) => tool.category === category)).toBe(true)
    }
  })

  it('gives every tool lowercase search words, none repeated', () => {
    for (const tool of tools) {
      expect(tool.keywords.length, tool.id).toBeGreaterThan(0)
      expect(new Set(tool.keywords).size, tool.id).toBe(tool.keywords.length)
      for (const keyword of tool.keywords) {
        expect(keyword).toMatch(/^[a-z0-9]+( [a-z0-9]+)*$/)
      }
    }
  })

  it('gives every tool a short card label', () => {
    for (const tool of tools) {
      expect(tool.short, tool.id).toMatch(/^[A-Z][^.]*[^.\s]$/)
      expect(tool.short.length, tool.id).toBeLessThanOrEqual(32)
    }
  })
})
