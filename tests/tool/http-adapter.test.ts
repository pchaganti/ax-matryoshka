import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HttpAdapter } from "../../src/tool/adapters/http.js";
import { readFileSync } from "fs";

describe("HttpAdapter", () => {
  let adapter: HttpAdapter;

  beforeEach(() => {
    // Use port 0 to let the OS assign a free port, avoiding conflicts on CI
    // Use 127.0.0.1 instead of localhost to avoid IPv4/IPv6 mismatch on Linux CI
    adapter = new HttpAdapter({ port: 0, host: "127.0.0.1" });
  });

  afterEach(async () => {
    await adapter.stop();
  });

  describe("constructor", () => {
    it("should use default options", () => {
      const defaultAdapter = new HttpAdapter();
      const info = defaultAdapter.getServerInfo();
      expect(info.port).toBe(3456);
      expect(info.host).toBe("localhost");
    });

    it("should accept custom options", () => {
      const customAdapter = new HttpAdapter({ port: 8080, host: "0.0.0.0" });
      const info = customAdapter.getServerInfo();
      expect(info.port).toBe(8080);
      expect(info.host).toBe("0.0.0.0");
    });
  });

  describe("start/stop", () => {
    it("should start and stop server", async () => {
      await adapter.start();
      await adapter.stop();
      // If we get here without error, the test passes
    });

    it("should stop gracefully when not started", async () => {
      await adapter.stop();
      // Should not throw
    });
  });

  describe("getTool", () => {
    it("should return null when no session is active", () => {
      const tool = adapter.getTool();
      expect(tool).toBeNull();
    });
  });

  describe("getServerInfo", () => {
    it("should return host and port", () => {
      const info = adapter.getServerInfo();
      expect(info).toHaveProperty("host");
      expect(info).toHaveProperty("port");
    });
  });

  describe("server timeouts", () => {
    it("should have requestTimeout set after start", async () => {
      await adapter.start();
      // Access internal server to verify timeouts are configured
      const server = (adapter as unknown as { server: { requestTimeout: number; headersTimeout: number } }).server;
      expect(server.requestTimeout).toBe(30_000);
      expect(server.headersTimeout).toBe(10_000);
    });
  });

  describe("content-type validation", () => {
    it("should return 415 for POST with wrong content-type", async () => {
      await adapter.start();
      const { port } = adapter.getServerInfo();

      const response = await fetch(`http://127.0.0.1:${port}/load`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json",
      });
      const data = await response.json();

      expect(response.status).toBe(415);
      expect(data.success).toBe(false);
      expect(data.error).toContain("application/json");
    });

    it("should allow POST to /reset without content-type", async () => {
      await adapter.start();
      const { port } = adapter.getServerInfo();

      // Load a document first so /reset has a session
      await fetch(`http://127.0.0.1:${port}/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "test" }),
      });

      const response = await fetch(`http://127.0.0.1:${port}/reset`, {
        method: "POST",
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe("HTTP endpoints (integration)", () => {
    it("should handle /health endpoint", async () => {
      await adapter.start();
      const { port } = adapter.getServerInfo();

      const response = await fetch(`http://127.0.0.1:${port}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe("ok");
      expect(data.data.session.active).toBe(false);
    });

    it("should handle /help endpoint", async () => {
      await adapter.start();
      const { port } = adapter.getServerInfo();

      const response = await fetch(`http://127.0.0.1:${port}/help`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain("grep");
    });

    it("should return same content for consecutive /help requests", async () => {
      await adapter.start();
      const { port } = adapter.getServerInfo();

      const response1 = await fetch(`http://127.0.0.1:${port}/help`);
      const data1 = await response1.json();

      const response2 = await fetch(`http://127.0.0.1:${port}/help`);
      const data2 = await response2.json();

      expect(data1.message).toBe(data2.message);
    });

    it("should handle /bindings without session", async () => {
      await adapter.start();
      const { port } = adapter.getServerInfo();

      const response = await fetch(`http://127.0.0.1:${port}/bindings`);
      const data = await response.json();

      // Bindings requires an active session
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("No active session");
    });

    it("should handle /stats without document", async () => {
      await adapter.start();
      const { port } = adapter.getServerInfo();

      const response = await fetch(`http://127.0.0.1:${port}/stats`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it("should handle /load with content", async () => {
      await adapter.start();
      const { port } = adapter.getServerInfo();

      const response = await fetch(`http://127.0.0.1:${port}/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "test line\nanother line", name: "test-doc" }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain("test-doc");
    });

    it("should handle /query after load", async () => {
      await adapter.start();
      const { port } = adapter.getServerInfo();

      // Load first
      await fetch(`http://127.0.0.1:${port}/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "error here\nok line\nerror again" }),
      });

      // Query
      const response = await fetch(`http://127.0.0.1:${port}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: '(grep "error")' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain("2 results");
    });

    it("should handle /reset", async () => {
      await adapter.start();
      const { port } = adapter.getServerInfo();

      // Load and query first
      await fetch(`http://127.0.0.1:${port}/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "test" }),
      });
      await fetch(`http://127.0.0.1:${port}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: '(grep "test")' }),
      });

      // Reset
      const response = await fetch(`http://127.0.0.1:${port}/reset`, {
        method: "POST",
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify bindings cleared
      const bindingsResponse = await fetch(`http://127.0.0.1:${port}/bindings`);
      const bindingsData = await bindingsResponse.json();
      expect(bindingsData.message).toBe("No bindings");
    });

    it("should return 404 for unknown endpoint", async () => {
      await adapter.start();
      const { port } = adapter.getServerInfo();

      const response = await fetch(`http://127.0.0.1:${port}/unknown`);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it("should return 405 for wrong method", async () => {
      await adapter.start();
      const { port } = adapter.getServerInfo();

      const response = await fetch(`http://127.0.0.1:${port}/load`, {
        method: "GET",
      });
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data.success).toBe(false);
    });

    it("should handle CORS preflight", async () => {
      await adapter.start();
      const { port } = adapter.getServerInfo();

      const response = await fetch(`http://127.0.0.1:${port}/query`, {
        method: "OPTIONS",
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost");
    });

  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit26.test.ts Audit26 #9: HTTP content-type case insensitive
  describe("Audit26 #9: HTTP content-type case insensitive", () => {
    it("should be importable", async () => {
      const mod = await import("../../src/tool/adapters/http.js");
      expect(mod.HttpAdapter).toBeDefined();
    });
  });

  // from tests/audit36.test.ts #11 — validateJsonContentType should check header length
  describe("#11 — validateJsonContentType should check header length", () => {
        it("should limit content-type header length", () => {
          const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
          const validateFn = source.match(/validateJsonContentType[\s\S]*?return true;\s*\}/);
          expect(validateFn).not.toBeNull();
          expect(validateFn![0]).toMatch(/length|MAX_HEADER/i);
        });
      });

});
