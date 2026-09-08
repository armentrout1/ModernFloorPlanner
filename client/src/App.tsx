import { lazy, Suspense, useEffect, useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import FloorPlanner from "@/pages/FloorPlanner";
const QuickRooms = lazy(() => import("@/pages/QuickRooms"));
const PhysicalDraft = lazy(() => import("@/pages/PhysicalDraft"));

function Router() {
  const [location] = useLocation();
  const [quickVisited, setQuickVisited] = useState(location === "/quick-room");
  useEffect(() => { if (location === "/quick-room") setQuickVisited(true); }, [location]);
  useEffect(() => {
    // The legacy canvas locks mobile page scrolling; Quick Rooms is a normal page.
    document.documentElement.classList.toggle("quick-room-active", location === "/quick-room" || location === "/physical-draft");
    return () => document.documentElement.classList.remove("quick-room-active");
  }, [location]);
  // Retain both independent in-memory drafts during navigation. Inactive editor
  // shortcuts and portals are disabled explicitly; hidden pages cannot own input.
  return (
    <>
      <div hidden={location !== "/"}><FloorPlanner active={location === "/"} /></div>
      {(quickVisited || location === "/quick-room") ?
        <div hidden={location !== "/quick-room"}><Suspense fallback={<p role="status" className="p-8">Loading Quick Rooms…</p>}><QuickRooms active={location === "/quick-room"} /></Suspense></div> : null}
      <Switch>
        <Route path="/">{null}</Route>
        <Route path="/quick-room">{null}</Route>
        <Route path="/physical-draft"><Suspense fallback={<p role="status" className="p-8">Loading physical draft...</p>}><PhysicalDraft /></Suspense></Route>
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
