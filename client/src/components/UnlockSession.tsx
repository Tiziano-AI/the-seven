import { useState } from "react";
import { Eye, EyeOff, Lock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { decryptApiKey, clearEncryptedKey, getEncryptedKeyMetadata } from "@/lib/crypto";

interface UnlockSessionProps {
  onUnlock: (apiKey: string) => void;
  onReset: () => void;
}

/**
 * UnlockSession renders the key unlock form for returning users.
 */
export function UnlockSession({ onUnlock, onReset }: UnlockSessionProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);

  const metadata = getEncryptedKeyMetadata();
  const maxAttempts = 5;
  const isLocked = attempts >= maxAttempts;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isLocked) {
      setError("Too many failed attempts. Reset your key to continue.");
      return;
    }

    setIsLoading(true);

    try {
      const apiKey = await decryptApiKey(password);
      onUnlock(apiKey);
    } catch (err) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      
      if (newAttempts >= maxAttempts) {
        setError("Too many failed attempts. Reset your key to continue.");
      } else {
        setError(
          err instanceof Error && err.message === "Incorrect password"
            ? `Incorrect password. ${maxAttempts - newAttempts} attempts remaining.`
            : "Unlock failed. Please try again."
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (confirm("Start fresh? Your encrypted key will be cleared.")) {
      clearEncryptedKey();
      onReset();
    }
  };

  return (
    <Card className="max-w-md w-full">
      <CardHeader className="space-y-3">
        <div className="flex items-center gap-3">
          <Lock className="icon-lg text-gold" />
          <div>
            <CardTitle>Welcome Back</CardTitle>
            <CardDescription>Unlock your key to speak to the council.</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {metadata && (
          <div className="flex items-center gap-2">
            <span className="badge badge-muted">
              Key locked on {new Date(metadata.createdAt).toLocaleDateString()}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Password Input */}
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="control-has-icon-right"
                disabled={isLoading || isLocked}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="icon-sm" /> : <Eye className="icon-sm" />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="icon-sm" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Unlock Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !password || isLocked}
          >
            {isLoading ? "Unlocking…" : "Unlock"}
          </Button>

          {/* Forgot Password Link */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isLoading}
            >
              Use a different key
            </Button>
          </div>
        </form>

        {/* Security Note */}
        <p className="text-sm text-muted-foreground text-center">
          Your key stays on your device, never on our server.{" "}
          <a
            href="https://github.com/Tiziano-AI/the-seven"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Verify the code
          </a>
          .
        </p>
      </CardContent>
    </Card>
  );
}
