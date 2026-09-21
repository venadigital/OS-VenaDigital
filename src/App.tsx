import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { DemoProvider, isDemoRequested, SupabaseProvider, useSupabaseSession } from '@/data/ApiContext';
import { supabaseConfigured } from '@/lib/supabase';
import { Shell } from '@/components/Shell';
import { LoginPage, SetupPage } from '@/features/auth/LoginPage';
import { HomePage } from '@/features/home/HomePage';
import { TiempoPage } from '@/features/tiempo/TiempoPage';
import { ConsumoPage } from '@/features/consumo/ConsumoPage';
import { TablerosPage } from '@/features/tableros/TablerosPage';
import { NotasPage } from '@/features/notas/NotasPage';
import { CalendarioPage } from '@/features/calendario/CalendarioPage';
import { AjustesPage } from '@/features/ajustes/AjustesPage';

// Excalidraw is heavy: load the editor only when a board is opened.
const BoardEditor = lazy(() => import('@/features/tableros/BoardEditor'));

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/tableros/:id"
        element={
          <Suspense fallback={<FullScreenMessage>Abriendo tablero…</FullScreenMessage>}>
            <BoardEditor />
          </Suspense>
        }
      />
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="tiempo" element={<TiempoPage />} />
        <Route path="calendario" element={<CalendarioPage />} />
        <Route path="consumo" element={<ConsumoPage />} />
        <Route path="tableros" element={<TablerosPage />} />
        <Route path="notas" element={<NotasPage />} />
        <Route path="ajustes" element={<AjustesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center text-[14px] text-ink-3">{children}</div>;
}

export default function App() {
  const demo = isDemoRequested();
  const { session, loading } = useSupabaseSession();

  if (demo) {
    return (
      <DemoProvider>
        <AppRoutes />
      </DemoProvider>
    );
  }
  if (!supabaseConfigured) return <SetupPage />;
  if (loading) return <FullScreenMessage>Cargando…</FullScreenMessage>;
  if (!session) return <LoginPage />;
  return (
    <SupabaseProvider session={session}>
      <AppRoutes />
    </SupabaseProvider>
  );
}
