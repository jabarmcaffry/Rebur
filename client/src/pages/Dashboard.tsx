import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Gamepad2, Clock, LogOut, User, Trash2, Pencil } from "lucide-react";
import { Link } from "wouter";
import type { Game } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newGameTitle, setNewGameTitle] = useState("");
  const [newGameDescription, setNewGameDescription] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: games, isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const createGameMutation = useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      return await apiRequest("POST", "/api/games", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      setCreateDialogOpen(false);
      setNewGameTitle("");
      setNewGameDescription("");
      toast({
        title: "Game created!",
        description: "Your new game project has been created.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to create game",
        variant: "destructive",
      });
    },
  });

  const deleteGameMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/games/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      setDeleteConfirmId(null);
      toast({ title: "Game deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete game", variant: "destructive" });
    },
  });

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/20 backdrop-blur">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 hover-elevate px-2 py-1 rounded-md">
                <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                  <Gamepad2 className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-semibold">Rebur Engine</span>
              </Link>
            <nav className="flex gap-4">
              <Link href="/dashboard" className="text-sm text-foreground hover-elevate px-3 py-2 rounded-md" data-testid="link-dashboard">
                  My Games
                </Link>
              <Link href="/games" className="text-sm text-muted-foreground hover-elevate px-3 py-2 rounded-md" data-testid="link-games">
                  Browse Games
                </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Link href={`/profile/${user?.id}`} className="flex items-center gap-2 hover-elevate px-3 py-2 rounded-md" data-testid="link-profile">
              {user?.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt={user.firstName || "User"}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
              )}
              <span className="text-sm">{user?.firstName || user?.email}</span>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = '/api/logout'}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">My Games</h1>
            <p className="text-muted-foreground">
              {games?.length || 0} game{games?.length !== 1 ? 's' : ''} created
            </p>
          </div>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            data-testid="button-create-game"
            size="lg"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Game
          </Button>
        </div>

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
              <Card key={game.id} className="overflow-hidden hover-elevate group" data-testid={`card-game-${game.id}`}>
                <Link href={`/editor/${game.id}`} className="block">
                  <div className="aspect-video bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center border-b border-card-border relative">
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
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(game.updatedAt)}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteConfirmId(game.id)}
                      data-testid={`button-delete-game-${game.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <Link href={`/editor/${game.id}`}>
                      <Button size="sm" variant="secondary" data-testid={`button-edit-${game.id}`}>
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Edit
                      </Button>
                    </Link>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Gamepad2 className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No games yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first game to get started building with Rebur Engine
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-game">
              <Plus className="w-5 h-5 mr-2" />
              Create Your First Game
            </Button>
          </Card>
        )}
      </main>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Game</DialogTitle>
            <DialogDescription>
              This will permanently delete the game and all its objects, scripts, and assets. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteGameMutation.isPending}
              onClick={() => deleteConfirmId && deleteGameMutation.mutate(deleteConfirmId)}
              data-testid="button-confirm-delete"
            >
              {deleteGameMutation.isPending ? "Deleting..." : "Delete Game"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Game Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-game">
          <DialogHeader>
            <DialogTitle>Create New Game</DialogTitle>
            <DialogDescription>
              Start a new game project. You can always change these details later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="title">Game Title</Label>
              <Input
                id="title"
                value={newGameTitle}
                onChange={(e) => setNewGameTitle(e.target.value)}
                placeholder="My Awesome AI Game"
                data-testid="input-game-title"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={newGameDescription}
                onChange={(e) => setNewGameDescription(e.target.value)}
                placeholder="A game about..."
                data-testid="input-game-description"
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createGameMutation.mutate({ title: newGameTitle, description: newGameDescription })}
              disabled={!newGameTitle.trim() || createGameMutation.isPending}
              data-testid="button-confirm-create"
            >
              {createGameMutation.isPending ? "Creating..." : "Create Game"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
