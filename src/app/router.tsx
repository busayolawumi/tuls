import { createBrowserRouter } from 'react-router'
import Home from './Home.tsx'
import Layout from './Layout.tsx'
import NotFound from './NotFound.tsx'

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
