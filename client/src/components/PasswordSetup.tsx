import { useState } from "react";
import { Eye, EyeOff, Lock, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  encryptAndStoreApiKey,
  estimatePasswordStrength,
  getPasswordStrengthLabel,
} from "@/lib/crypto";

interface PasswordSetupProps {
  apiKey: string;
  onComplete: () => void;
}

/**
 * PasswordSetup renders the local key encryption setup flow.
 */
export function PasswordSetup({ apiKey, onComplete }: PasswordSetupProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const passwordStrength = estimatePasswordStrength(password);
  const strengthLabel = getPasswordStrengthLabel(passwordStrength);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (passwordStrength < 2) {
      setError("Please choose a stronger password");
      return;
    }

    setIsLoading(true);

    try {
      await encryptAndStoreApiKey(password, apiKey);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to protect key");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="max-w-md w-full">
      <CardHeader className="space-y-3">
        <div className="flex items-center gap-3">
          <Lock className="icon-lg text-gold" />
          <div>
            <CardTitle>Lock Your Key</CardTitle>
            <CardDescription>
              Set a password to protect your council key on this device.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <Alert>
          <Key className="icon-sm text-gold" />
          <AlertDescription className="text-sm">
            Your key is encrypted and stored locally. You’ll use this password to unlock it when you
            come back.
          </AlertDescription>
        </Alert>

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
                placeholder="Create a strong password"
                className="control-has-icon-right"
                disabled={isLoading}
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
            
            {/* Password Strength Indicator */}
            {password.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      passwordStrength === 0
                        ? "bg-destructive w-1/5"
                        : passwordStrength === 1
                          ? "bg-destructive w-2/5"
                          : passwordStrength === 2
                            ? "bg-gold w-3/5"
                            : passwordStrength === 3
                              ? "bg-evergreen w-4/5"
                              : "bg-violet w-full"
                    }`}
                  />
                </div>
                <span className={`text-sm font-medium ${strengthLabel.color}`}>
                  {strengthLabel.label}
                </span>
              </div>
            )}
          </div>

          {/* Confirm Password Input */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              disabled={isLoading}
            />
            {confirmPassword.length > 0 && (
              <p
                className={`text-sm ${passwordsMatch ? "text-evergreen" : "text-destructive"}`}
              >
                {passwordsMatch ? "✓ Passwords match" : "✗ Passwords do not match"}
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !passwordsMatch || passwordStrength < 2}
          >
            {isLoading ? "Locking…" : "Lock & Continue"}
          </Button>

          {/* Help Text */}
          <p className="text-sm text-muted-foreground text-center">
            Your password never leaves this device. If you forget it, you’ll need to enter your key
            again.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
