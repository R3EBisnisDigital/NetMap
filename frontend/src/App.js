import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import MapsListPage from "@/pages/MapsListPage";
import MapViewPage from "@/pages/MapViewPage";

function App() {
  useEffect(() => {
    document.title = "NetMap \u2014 Network Topology Monitor";
  }, []);
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MapsListPage />} />
          <Route path="/maps/:id" element={<MapViewPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </div>
  );
}

export default App;
