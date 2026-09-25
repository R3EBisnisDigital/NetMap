import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { AuthProvider } from "@/auth/AuthProvider";
import MapsListPage from "@/pages/MapsListPage";
import MapViewPage from "@/pages/MapViewPage";
import LoginPage from "@/pages/LoginPage";

function App() {
  useEffect(() => {
    document.title = "NetMap — Network Topology Monitor";
  }, []);
  return (
    <div className="App">
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LoginPage />} />
              <Route path="/maps" element={<MapsListPage />} />
              <Route path="/maps/:id" element={<MapViewPage />} />
            </Routes>
          </BrowserRouter>
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </div>
  );
}

export default App;
