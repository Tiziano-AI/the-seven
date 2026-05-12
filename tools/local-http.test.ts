import net from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { allocateFreeLoopbackPort, buildLocalHttpProjection } from "./local-http";

const openServers: net.Server[] = [];

async function listen(port: number) {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  openServers.push(server);
  return server;
}

async function closeServer(server: net.Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe("local HTTP projection", () => {
  afterEach(async () => {
    while (openServers.length > 0) {
      const server = openServers.pop();
      if (server) {
        await closeServer(server);
      }
    }
  });

  test("projects one loopback port into the server and client URLs", () => {
    const projection = buildLocalHttpProjection({
      env: { NODE_ENV: "test", SEVEN_PUBLIC_ORIGIN: "http://localhost:3000" },
      port: 43_217,
    });

    expect(projection.port).toBe(43_217);
    expect(projection.baseUrl).toBe("http://127.0.0.1:43217");
    expect(projection.publicOrigin).toBe("http://localhost:43217");
    expect(projection.nextDistDir).toBe(".next-local/43217");
    expect(projection.env.PORT).toBe("43217");
    expect(projection.env.SEVEN_BASE_URL).toBe("http://127.0.0.1:43217");
    expect(projection.env.SEVEN_NEXT_DIST_DIR).toBe(".next-local/43217");
    expect(projection.env.SEVEN_PUBLIC_ORIGIN).toBe("http://localhost:43217");
  });

  test("preserves explicit non-loopback public origins for live proof", () => {
    const projection = buildLocalHttpProjection({
      env: { NODE_ENV: "test", SEVEN_PUBLIC_ORIGIN: "https://theseven.ai/" },
      port: 43_218,
    });

    expect(projection.baseUrl).toBe("http://127.0.0.1:43218");
    expect(projection.publicOrigin).toBe("https://theseven.ai");
    expect(projection.env.SEVEN_PUBLIC_ORIGIN).toBe("https://theseven.ai");
  });

  test("allocates a port that is not already occupied", async () => {
    const occupied = await listen(0);
    const address = occupied.address();
    if (typeof address !== "object" || address === null) {
      throw new Error("Failed to open an occupied loopback port.");
    }
    const port = await allocateFreeLoopbackPort();

    expect(port).not.toBe(address.port);
    expect(occupied.listening).toBe(true);
  });
});
