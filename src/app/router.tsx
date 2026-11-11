import type { ComponentType } from 'react'
import { createBrowserRouter } from 'react-router'
import { tools } from '../tools/registry.ts'
import ErrorPage from './ErrorPage.tsx'
import Home from './Home.tsx'
import Layout from './Layout.tsx'
import NotFound from './NotFound.tsx'
import Privacy from './Privacy.tsx'

// Each tool's code is only downloaded when its page is opened.
const toolPages = import.meta.glob<{ default: ComponentType }>(
  '../tools/*/Tool.tsx',
)

export const router = createBrowserRouter([
  {
    element: <Layout />,
    // Shown for the moment a tool's code is still loading on a direct visit.
    // React Router shows nothing then anyway, but warns every time without it.
    HydrateFallback: () => null,
    children: [
      {
        // Errors show inside the layout, so the wordmark and footer stay.
        errorElement: <ErrorPage />,
        children: [
          { index: true, element: <Home /> },
          ...tools.map((tool) => ({
            path: tool.id,
            lazy: {
              Component: async () =>
                (await toolPages[`../tools/${tool.id}/Tool.tsx`]()).default,
            },
          })),
          { path: 'privacy', element: <Privacy /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])
