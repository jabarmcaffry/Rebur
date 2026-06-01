import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import AuthPage from "@/pages/AuthPage";
import HomePage from "@/pages/HomePage";
import ExplorePage from "@/pages/ExplorePage";
import AvatarPage from "@/pages/AvatarPage";
import MessagesPage from "@/pages/MessagesPage";
import AlertsPage from "@/pages/AlertsPage";
import EditorPage from "@/pages/Editor";
import PlayPage from "@/pages/PlayPage";
import ProfilePage from "@/pages/Profile";
import AdminDashboard from "@/pages/AdminDashboard";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect to="/auth" />;
  return <Component />;
}

function RootRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Redirect to="/home" />;
  return <Landing />;
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      {/* Public routes — no auth needed */}
      <Route path="/explore" component={ExplorePage} />
      <Route path="/play/:gameId" component={PlayPage} />
      {/* Protected routes */}
      <Route path="/home">
        <ProtectedRoute component={HomePage} />
      </Route>
      <Route path="/avatar">
        <ProtectedRoute component={AvatarPage} />
      </Route>
      <Route path="/messages">
        <ProtectedRoute component={MessagesPage} />
      </Route>
      <Route path="/alerts">
        <ProtectedRoute component={AlertsPage} />
      </Route>
      <Route path="/editor/:gameId">
        <ProtectedRoute component={EditorPage} />
      </Route>
      <Route path="/profile/:userId">
        <ProtectedRoute component={ProfilePage} />
      </Route>
      <Route path="/profile">
        <ProtectedRoute component={ProfilePage} />
      </Route>
      <Route path="/admin">
        <ProtectedRoute component={AdminDashboard} />
      </Route>
      {/* Legacy redirects */}
      <Route path="/dashboard">
        <Redirect to="/home" />
      </Route>
      <Route path="/games">
        <Redirect to="/explore" />
      </Route>
      <Route path="/">
        <RootRoute />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
