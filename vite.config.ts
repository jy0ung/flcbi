import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const serverHost = env.VITE_HOST || "::";
  const serverPort = Number(env.VITE_PORT || 8080);
  const previewPort = Number(env.VITE_PREVIEW_PORT || serverPort);
  const apiPort = Number(env.API_PORT || 3001);
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${apiPort}`;
  const supabaseApiPort = Number(env.SUPABASE_API_PORT || 54321);
  const supabaseProxyTarget =
    env.VITE_SUPABASE_PROXY_TARGET || `http://127.0.0.1:${supabaseApiPort}`;
  const hmrHost = env.VITE_HMR_HOST || env.VITE_PUBLIC_HOST || undefined;
  const hmrClientPort = env.VITE_HMR_CLIENT_PORT
    ? Number(env.VITE_HMR_CLIENT_PORT)
    : undefined;
  const hmrProtocol = env.VITE_HMR_PROTOCOL || undefined;
  const allowedHosts = Array.from(
    new Set(
      [env.VITE_PUBLIC_HOST, env.TEST_SERVER_PUBLIC_HOST, env.TEST_SERVER_HOST, "localhost"]
        .flatMap((value) => (value ? value.split(",") : []))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  return {
    server: {
      host: serverHost,
      port: serverPort,
      strictPort: true,
      allowedHosts,
      hmr: {
        ...(hmrHost ? { host: hmrHost } : {}),
        ...(hmrClientPort ? { clientPort: hmrClientPort } : {}),
        ...(hmrProtocol ? { protocol: hmrProtocol } : {}),
        overlay: false,
      },
      proxy: {
        "/v1": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        "/docs": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        "/docs-json": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        "^/(auth|rest|storage|realtime|functions)/v1": {
          target: supabaseProxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: {
      host: serverHost,
      port: previewPort,
      strictPort: true,
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@flcbi/contracts": path.resolve(__dirname, "./packages/contracts/src/index.ts"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
  };
});
