import { createApp } from "./app.js";
import { config } from "./config/env.js";

const app = createApp();

// Detrás de nginx/Next hay que indicar cuántos proxies son de confianza; si no, todas las personas comparten
// una sola IP (límites de tasa globales, registro de actividad sin la IP real). Ver docs/DEPLOYMENT.md.
if (config.isProduction) {
  const raw = process.env.TRUST_PROXY;
  if (!raw || raw === "false") {
    console.warn("⚠️  TRUST_PROXY no está definido: req.ip será la IP del proxy y los límites de tasa serán globales.");
  } else if (raw === "true") {
    console.warn("⚠️  TRUST_PROXY=true confía en cualquier X-Forwarded-For (se pueden evadir los límites). Usa el número exacto de proxies.");
  }
}

app.listen(config.port, () => {
  console.log(`🚀 Servidor backend de Grúas Cares ejecutándose en http://localhost:${config.port}`);
  console.log(`📡 Entorno: ${config.nodeEnv}`);
  console.log(`🔒 CORS permitido para: ${config.corsOrigins.join(", ")}`);
});
