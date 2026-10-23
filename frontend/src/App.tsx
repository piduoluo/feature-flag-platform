import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { router } from './router';
import './styles/prototype.css';

export const App: React.FC = () => {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#FF6400',
          colorLink: '#FF6400',
          colorLinkHover: '#E65A00',
          colorPrimaryHover: '#E65A00',
          colorPrimaryActive: '#CC5000',
          colorLinkActive: '#CC5000',
          borderRadius: 6,
          fontFamily: 'var(--font-ui)',
          fontFamilyCode: 'var(--font-ui)',
          fontWeightStrong: 600,
        },
      }}
    >
      <RouterProvider router={router} />
    </ConfigProvider>
  );
};

export default App;
