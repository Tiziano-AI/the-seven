import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useNavigate } from "@/lib/routing/router";
import { AppShell } from "@/components/AppShell";

export default function NotFound() {
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate("/");
  };

  return (
    <AppShell layout="centered" showNav={false}>
      <Card className="max-w-2xl mx-4">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-destructive rounded-full opacity-20 animate-pulse" />
              <AlertCircle className="text-destructive relative icon-4xl" />
            </div>
          </div>

          <h1 className="text-violet text-4xl font-bold mb-2">404</h1>

          <h2 className="text-gold text-xl font-semibold mb-4">Lost in the halls</h2>

          <p className="text-muted-foreground mb-8 leading-relaxed">
            This page doesn’t exist.
            <br />
            Return to the council.
          </p>

          <div
            id="not-found-button-group"
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button onClick={handleGoHome} size="lg">
              <Home className="icon-sm" />
              Back to Ask
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
