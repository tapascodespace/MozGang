import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import LandingPage from "./pages/LandingPage";
import IntakePage from "./pages/IntakePage";
import WorkspacePage from "./pages/WorkspacePage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function LandingRoute() {
  const navigate = useNavigate();
  return <LandingPage onEnter={() => navigate("/upload")} />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingRoute />} />
          <Route path="/upload" element={<IntakePage />} />
          <Route path="/workspace/:projectId" element={<WorkspacePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
