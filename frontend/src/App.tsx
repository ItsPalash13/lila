import { NakamaAuthProvider, useNakamaAuth } from "./auth/NakamaAuthContext";
import { AuthPanel } from "./auth/AuthPanel";
import { SessionDashboard } from "./auth/SessionDashboard";
import { NakamaSocketProvider } from "./nakama/NakamaSocketContext";

function AppContent() {
  const { session, authReady } = useNakamaAuth();

  if (!authReady) {
    return (
      <p className="app-auth-restoring" aria-busy="true">
        Restoring session…
      </p>
    );
  }

  return (
    <>
      {!session ? <h1 className="app-title-guest">Lila · Nakama</h1> : null}
      {session ? (
        <SessionDashboard session={session} />
      ) : (
        <AuthPanel />
      )}
    </>
  );
}

function App() {
  return (
    <NakamaAuthProvider>
      <NakamaSocketProvider>
        <AppContent />
      </NakamaSocketProvider>
    </NakamaAuthProvider>
  );
}

export default App;
