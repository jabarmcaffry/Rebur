import { Button } from "@/components/ui/button";
import { Code2, Gamepad2, Users, Zap } from "lucide-react";
// Change the old import to this:
// This assumes Landing.tsx is in client/src/pages/
import heroImage from "@/assets/Game_engine_editor_interface_23dc5ed5-BLofFlzR.png";




import { Link } from "wouter";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Code2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold">Rebur Engine</span>
          </div>
          <Link href="/auth">
            <Button
              data-testid="button-login"
              variant="default"
            >
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 md:py-32 overflow-hidden">
        {/* Background gradient wash for hero image */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-background z-0"></div>
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-primary via-blue-400 to-primary bg-clip-text text-transparent">
              Build Games with Rebur Engine
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Create immersive 3D games with the Rebur Engine. Build intelligent NPCs, multiplayer worlds, and rich interactive experiences right in your browser.
            </p>
            <div className="flex gap-4 justify-center">
              <Link href="/auth">
                <Button
                  size="lg"
                  data-testid="button-hero-start"
                  className="h-12 px-8 text-lg"
                >
                  Start Creating
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                data-testid="button-learn-more"
                className="h-12 px-8 text-lg bg-background/50 backdrop-blur"
              >
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-card/30">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Everything You Need to Create Great Games
          </h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <div className="bg-card border border-card-border rounded-md p-6 hover-elevate">
              <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                <Code2 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">TypeScript Scripting</h3>
              <p className="text-muted-foreground">
                Write game logic with familiar TypeScript. Drive NPCs, animations, and gameplay through the Rebur Engine's powerful scripting API.
              </p>
            </div>

            <div className="bg-card border border-card-border rounded-md p-6 hover-elevate">
              <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                <Gamepad2 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">3D Editor</h3>
              <p className="text-muted-foreground">
                Professional game editor with visual scene building, hierarchy management, and real-time 3D preview. Import models or use built-in assets.
              </p>
            </div>

            <div className="bg-card border border-card-border rounded-md p-6 hover-elevate">
              <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Multiplayer</h3>
              <p className="text-muted-foreground">
                Publish your games and invite others to play. Real-time multiplayer support lets players join your AI-powered worlds together.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Simple Workflow, Powerful Results
          </h2>
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex gap-6">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                1
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Create Your Scene</h3>
                <p className="text-muted-foreground">
                  Use the visual editor to build your 3D world. Add objects, terrain, lights, and avatars with drag-and-drop simplicity.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                2
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Write Game Logic</h3>
                <p className="text-muted-foreground">
                  Add behavior with TypeScript scripts. Build AI, mechanics, and animations using the Rebur Engine's clean, well-documented API.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                3
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Test & Publish</h3>
                <p className="text-muted-foreground">
                  Play your game instantly in the browser. When ready, publish it for others to discover and enjoy your AI-powered creation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-card/30">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center">
            <Zap className="w-16 h-16 text-primary mx-auto mb-6" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Build Something Amazing?
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Join thousands of creators building immersive games with Rebur Engine
            </p>
            <Link href="/auth">
              <Button
                size="lg"
                data-testid="button-cta-signup"
                className="h-12 px-8 text-lg"
              >
                Start Creating for Free
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 bg-card/20">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>&copy; 2025 Rebur Engine. Build games for everyone.</p>
        </div>
      </footer>
    </div>
  );
}
