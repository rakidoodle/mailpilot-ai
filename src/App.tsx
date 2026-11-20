import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { AgentActivity } from "./pages/AgentActivity";
import { Analytics } from "./pages/Analytics";
import { Dashboard } from "./pages/Dashboard";
import { EmailDetail } from "./pages/EmailDetail";
import { Inbox } from "./pages/Inbox";
import { ScheduledEmails } from "./pages/ScheduledEmails";
import { Settings } from "./pages/Settings";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="inbox/:id" element={<EmailDetail />} />
          <Route path="scheduled" element={<ScheduledEmails />} />
          <Route path="activity" element={<AgentActivity />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
