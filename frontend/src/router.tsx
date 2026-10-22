import { RouteObject, createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { FlagListPage } from './pages/FlagListPage';
import { EvaluationConsolePage } from './pages/EvaluationConsolePage';
import { FlagDetailPage } from './pages/FlagDetailPage';
import { GlobalAuditLogsPage } from './pages/GlobalAuditLogsPage';

export const routeConfig: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <Navigate to="/flags" replace />,
      },
      {
        path: 'flags',
        element: <FlagListPage />,
      },
      {
        path: 'flags/:id',
        element: <FlagDetailPage />,
      },
      {
        path: 'evaluations',
        element: <EvaluationConsolePage />,
      },
      {
        path: 'audit-logs',
        element: <GlobalAuditLogsPage />,
      },
      {
        path: '*',
        element: <Navigate to="/flags" replace />,
      },
    ],
  },
];

export const router = createBrowserRouter(routeConfig);
