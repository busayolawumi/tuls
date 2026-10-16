import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { ToolManifest } from '../tools/types'

/**
 * A link to a tool's page. A tool that needs its page cross-origin isolated
 * (LibreOffice's) is loaded afresh when this page isn't, because the
 * isolating headers only count when a page loads. Between isolated pages,
 * it's an ordinary link, so their engine stays running.
 */
export function ToolLink({
  tool,
  className,
  children,
}: {
  tool: ToolManifest
  className?: string
  children: ReactNode
}) {
  return (
    <Link
      to={`/${tool.id}`}
      reloadDocument={tool.isolated && !self.crossOriginIsolated}
      className={className}
    >
      {children}
    </Link>
  )
}
