import { HomeScreen } from "@/components/screens/home-screen";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readSingleSearchParam(value: string | ReadonlyArray<string> | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }

  return value?.[0] ?? null;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialDemoToken = readSingleSearchParam(resolvedSearchParams.demo_token);

  return <HomeScreen initialDemoToken={initialDemoToken} />;
}
