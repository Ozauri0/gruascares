import { createApp } from "./app.js";
import { config } from "./config/env.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`🚀 Servidor backend de Grúas Cares ejecutándose en http://localhost:${config.port}`);
  console.log(`📡 Entorno: ${config.nodeEnv}`);
  console.log(`🔒 CORS permitido para: ${config.corsOrigins.join(", ")}`);
});
