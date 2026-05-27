import { Button } from "@/components/ui/button";
import { Code2, Gamepad2, Users, Zap } from "lucide-react";
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
            <span className="text-xl font-semibold">Rebur</span>
          </div>
          <Link href="/auth">
            <Button data-testid="button-login" variant="default">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 md:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-background z-0"></div>

        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${heroImage})` }}
        />

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">

            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-primary via-blue-400 to-primary bg-clip-text text-transparent">
              Build Interactive 3D Experiences
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Create interactive 3D worlds in your browser. Build games, online stores, places to hang out, simulations, events, and more.
            </p>

            <div className="flex gap-4 justify-center">
              <Link href="/auth">
                <Button size="lg" data-testid="button-hero-start" className="h-12 px-8 text-lg">
                  Start Creating
                </Button>
              </Link>

              <Button
                size="lg"
                variant="outline"
                onClick={() =>
                  document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })
                }
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
            Everything You Need to Build Interactive 3D Experiences
          </h2>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">

            <div className="bg-card border border-card-border rounded-md p-6 hover-elevate">
              <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                <Code2 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">TypeScript Scripting</h3>
              <p className="text-muted-foreground">
                Build behavior with simple TypeScript. Control objects, interactions, UI, and gameplay using Rebur’s scripting system.
              </p>
            </div>

            <div className="bg-card border border-card-border rounded-md p-6 hover-elevate">
              <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                <Gamepad2 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">3D Editor</h3>
              <p className="text-muted-foreground">
                Visual editor for building 3D worlds. Place objects, design environments, and see changes instantly in the browser.
              </p>
            </div>

            <div className="bg-card border border-card-border rounded-md p-6 hover-elevate">
              <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Multiplayer</h3>
              <p className="text-muted-foreground">
                Let people join your experiences in real time — explore, interact, and collaborate together inside your worlds.
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
                <h3 className="text-xl font-semibold mb-2">Create Your World</h3>
                <p className="text-muted-foreground">
                  Build a 3D experience using the visual editor — from small scenes to full interactive environments.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                2
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Add Behavior</h3>
                <p className="text-muted-foreground">
                  Use TypeScript to make things interactive — add movement, logic, UI, and real-time interactions.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                3
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Publish & Share</h3>
                <p className="text-muted-foreground">
                  Share your experience instantly or embed it into your own website or app.
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
              Ready to build something interactive?
            </h2>

            <p className="text-xl text-muted-foreground mb-8">
              Join creators building games, stores, hangouts, and interactive web experiences.
            </p>

            <Link href="/auth">
              <Button size="lg" data-testid="button-cta-signup" className="h-12 px-8 text-lg">
                Start Creating for Free
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 bg-card/20">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>&copy; 2025 Rebur. Build interactive 3D experiences for the web.</p>
        </div>
      </footer>
    </div>
  );
}
