import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DemoAuthState } from "../hooks/useDemoAuth";

type DemoEntryCardProps = Readonly<{
  state: DemoAuthState;
  emailInput: string;
  onEmailInputChange: (value: string) => void;
  isRequesting: boolean;
  onRequest: () => void;
  onReset: () => void;
}>;

/**
 * DemoEntryCard renders the free demo magic-link entry flow.
 */
export function DemoEntryCard(props: DemoEntryCardProps) {
  if (props.state === "sent") {
    return (
      <Card className="max-w-md w-full">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <Mail className="icon-lg text-violet" />
            <div>
              <CardTitle>Check your inbox</CardTitle>
              <CardDescription>
                We sent a magic link. Open it to start your demo.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Didn’t get it? You can resend or try a different email.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={props.onRequest}
              disabled={props.isRequesting}
            >
              Resend link
            </Button>
            <Button variant="ghost" size="sm" onClick={props.onReset}>
              Use another email
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md w-full">
      <CardHeader className="space-y-3">
        <div className="flex items-center gap-3">
          <Mail className="icon-lg text-violet" />
          <div>
            <CardTitle>Try the free demo</CardTitle>
            <CardDescription>
              Get a magic link—no password, no key.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="demoEmail">Email</Label>
          <Input
            id="demoEmail"
            type="email"
            placeholder="you@company.com"
            value={props.emailInput}
            onChange={(event) => props.onEmailInputChange(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && props.onRequest()}
          />
          <p className="text-sm text-muted-foreground">
            We use this only to send your one-time link.
          </p>
        </div>
        <Button onClick={props.onRequest} disabled={props.isRequesting} className="w-full">
          {props.isRequesting ? "Sending…" : "Send magic link"}
        </Button>
      </CardContent>
    </Card>
  );
}
