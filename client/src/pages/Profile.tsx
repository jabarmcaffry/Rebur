import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Gamepad2, User, ArrowLeft, Play } from "lucide-react";
import type { Game, User as UserType } from "@shared/schema";

export default function Profile() {
  const { userId } = useParams<{ userId: string }>();

  const { data: user } = useQuery<UserType>({
    queryKey: [`/api/auth/user`],
    enabled: !!userId,
  });

  const { data: games, isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
    select: (allGames) => allGames.filter(g => g.userId === userId && g.isPublished),
  });

  const displayName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.firstName || user?.email || "User";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/20 backdrop-blur">
        <div className="container mx-auto px-6 h-16 flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Gamepad2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold">Rebur Engine</span>
          </div>
        </div>
      </header>

      {/* Profile Header */}
      <section className="bg-gradient-to-b from-card/30 to-background border-b border-border">
        <div className="container mx-auto px-6 py-12">
          <div className="flex items-center gap-6">
            {user?.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={displayName}
                className="w-24 h-24 rounded-full object-cover border-2 border-border"
                data-testid="img-profile-avatar"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center border-2 border-border">
                <User className="w-12 h-12 text-muted-foreground" />
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold mb-2" data-testid="text-profile-name">
                {displayName}
              </h1>
              <p className="text-muted-foreground">
                {games?.length || 0} published game{games?.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Published Games */}
      <main className="container mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-6">Published Creations</h2>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="aspect-video bg-muted" />
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-3/4" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-muted rounded w-full mb-2" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : games && games.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {games.map((game) => (
              <Card key={game.id} className="overflow-hidden hover-elevate" data-testid={`card-published-game-${game.id}`}>
                <Link href={`/play/${game.id}`} className="block">
                  <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border-b border-card-border">
                    {game.thumbnail ? (
                      <img src={game.thumbnail} alt={game.title} className="w-full h-full object-cover" />
                    ) : (
                      <Gamepad2 className="w-16 h-16 text-muted-foreground/50" />
                    )}
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
                      <Play className="w-4 h-4 mr-1" />
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
            <p className="text-muted-foreground">
              This user hasn't published any games yet
            </p>
          </Card>
        )}
      </main>
    </div>
  );
}
