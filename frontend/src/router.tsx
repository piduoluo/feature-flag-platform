import React from 'react';
import { RouteObject, createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { FlagListPage } from './pages/FlagListPage';
import { EvaluationConsolePage } from './pages/EvaluationConsolePage';
import { FlagDetailPage } from './pages/FlagDetailPage';
import { GlobalAuditLogsPage } from './pages/GlobalAuditLogsPage';

const RedirectPreserveSearch: React.FC<{ to: string }> = ({ to }) => {
  const location = useLocation();
  return <Navigate to={{ pathname: to, search: location.search }} replace />;
};

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
        path: 'flags/:id/:tab',
        element: <FlagDetailPage />,
      },
      {
        path: 'evaluations',
        element: <EvaluationConsolePage />,
      },
      {
        path: 'evaluation',
        element: <RedirectPreserveSearch to="/evaluations" />,
      },
      {
        path: 'audit-logs',
        element: <GlobalAuditLogsPage />,
      },
      {
        path: 'audit',
        element: <RedirectPreserveSearch to="/audit-logs" />,
      },
      {
        path: '*',
        element: <Navigate to="/flags" replace />,
      },
    ],
  },
];

export const router = createBrowserRouter(routeConfig);
