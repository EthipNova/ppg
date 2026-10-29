import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { isSupabaseConfigured, missingSupabaseSettings } from "./integrations/supabase/config";

const App = lazy(() => import("./App.tsx"));

function ConfigurationMessage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-white">
      <section className="w-full max-w-xl rounded-2xl border border-amber-400/30 bg-zinc-900 p-8 shadow-2xl">
        <p className="mb-2 text-sm font-bold uppercase tracking-widest text-amber-300">
          Setup required
        </p>
        <h1 className="mb-4 text-2xl font-black">Supabase is not configured</h1>
        <p className="mb-4 leading-7 text-zinc-300">
          The app cannot connect to authentication and gym data until both frontend
          settings are filled in the project&apos;s <code className="text-lime-300">.env.local</code> file:
        </p>
        <ul className="mb-5 list-inside list-disc space-y-1 rounded-xl bg-zinc-950 p-4 text-sm text-amber-200">
          {missingSupabaseSettings.map((setting) => <li key={setting}>{setting} is missing or invalid</li>)}
        </ul>
        <pre className="mb-5 overflow-x-auto rounded-xl bg-zinc-950 p-4 text-sm text-lime-200">{`VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key`}</pre>
        <p className="text-sm leading-6 text-zinc-400">
          Get these values from your Supabase project&apos;s API settings. Save the file,
          stop the Vite server with Ctrl+C, then run <code className="text-zinc-200">npm run dev</code> again.
          Do not put your PostgreSQL password or a service-role key in this frontend file.
        </p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isSupabaseConfigured ? (
      <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
        <App />
      </Suspense>
    ) : (
      <ConfigurationMessage />
    )}
  </StrictMode>,
);
