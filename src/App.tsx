import { AppProvider } from "./context/AppContext";
import { isTauri } from "./utils/env";
import WebLayout from "./layouts/WebLayout";
import DesktopLayout from "./layouts/DesktopLayout";
import Dashboard from "./components/Dashboard";

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

function AppContent() {
  return isTauri() ? (
    <DesktopLayout />
  ) : (
    <WebLayout>
      <Dashboard />
    </WebLayout>
  );
}
