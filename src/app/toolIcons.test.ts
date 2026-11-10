import { describe, expect, it } from 'vitest'
import { categories, tools } from '../tools/registry'
import { CATEGORY_ICONS, TOOL_ICONS } from './toolIcons'

describe('the home page icons', () => {
  it('has one for every tool and group, and none left over', () => {
    expect(Object.keys(TOOL_ICONS).sort()).toEqual(
      tools.map((tool) => tool.id).sort(),
    )
    for (const category of categories) {
      expect(CATEGORY_ICONS[category], category).toBeDefined()
    }
  })
})
