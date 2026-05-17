import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Gamepad2, Play, User, ArrowLeft } from "lucide-react";
import type { Game } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

export default function Games() {
  const { isAuthenticated } = useAuth();

  const { data: games, isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games/published"],
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/20 backdrop-blur">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {isAuthenticated && (
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" data-testid="button-back-dashboard">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
            )}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                <Gamepad2 className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold">Rebur Engine</span>
            </div>
          </div>
          {!isAuthenticated && (
            <Button
              onClick={() => window.location.href = '/api/login'}
              data-testid="button-login-games"
            >
              Get Started
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Browse Games</h1>
          <p className="text-muted-foreground">
            Discover games created by the community with Rebur Engine
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="aspect-video bg-muted" />
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-4 bg-muted rounded w-full" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : games && games.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {games.map((game) => (
              <Card key={game.id} className="overflow-hidden hover-elevate" data-testid={`card-game-${game.id}`}>
                <Link href={`/play/${game.id}`} className="block">
                  <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border-b border-card-border relative group">
                    {game.thumbnail ? (
                      <img src={game.thumbnail} alt={game.title} className="w-full h-full object-cover" />
                    ) : (
                      <Gamepad2 className="w-16 h-16 text-muted-foreground/50" />
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Play className="w-12 h-12 text-white" />
                    </div>
                  </div>
                </Link>
                <CardHeader className="pb-3">
                  <h3 className="font-semibold text-lg truncate">{game.title}</h3>
                  {game.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{game.description}</p>
                  )}
                </CardHeader>
                <CardFooter className="flex justify-between items-center pt-0 gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Play className="w-3 h-3" />
                    <span>{game.plays || 0} plays</span>
                  </div>
                  <Link href={`/play/${game.id}`}>
                    <Button size="sm" variant="default" data-testid={`button-play-${game.id}`}>
                      Play
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Gamepad2 className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No published games yet</h3>
            <p className="text-muted-foreground mb-6">
              Be the first to publish a game for the community!
            </p>
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button data-testid="button-create-first-public">
                  Create a Game
                </Button>
              </Link>
            ) : (
              <Button onClick={() => window.location.href = '/api/login'} data-testid="button-signup-create">
                Sign Up to Create
              </Button>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
