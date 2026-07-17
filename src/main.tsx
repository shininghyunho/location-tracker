import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import './index.css';
import App from './App.tsx';

const queryClient = new QueryClient();

async function bootstrap() {
  // 웹 개발 서버에서만 가짜 하루 데이터를 넣는다 (동적 import라 프로덕션 번들엔 제외)
  if (import.meta.env.DEV && !Capacitor.isNativePlatform()) {
    const { seedDevPoints } = await import('./dev/seedPoints');
    await seedDevPoints();
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap();
