import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Key, Loader2 } from "lucide-react";

/**
 * ApiKeyEntryCard renders the initial BYOK entry step.
 */
export function ApiKeyEntryCard(props: {
  apiKeyInput: string;
  onApiKeyInputChange: (value: string) => void;
  isValidating: boolean;
  onContinue: () => void;
}) {
  return (
    <Card className="max-w-md w-full">
      <CardHeader className="space-y-3">
        <div className="flex items-center gap-3">
          <Key className="icon-lg text-gold" />
          <div>
            <CardTitle>Enter Your Key</CardTitle>
            <CardDescription>
              Your OpenRouter API key unlocks the council.{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Get one here
              </a>
              .
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="apiKey">OpenRouter key</Label>
          <Input
            id="apiKey"
            type="password"
            value={props.apiKeyInput}
            onChange={(e) => props.onApiKeyInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && props.onContinue()}
            placeholder="sk-or-v1-..."
          />
          <p className="text-sm text-muted-foreground">
            Stays on your device, never on our server.{" "}
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
        </div>
        <Button
          onClick={props.onContinue}
          disabled={props.isValidating}
          className="w-full"
        >
          {props.isValidating && <Loader2 className="animate-spin icon-sm" />}
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}
