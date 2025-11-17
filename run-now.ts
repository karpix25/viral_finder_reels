import { mastra } from "./src/mastra/index.js";
import { executeInstagramAnalysis } from "./src/mastra/workflows/instagramAnalysisWorkflow.js";

console.log("🚀 Запуск анализа Instagram аккаунтов вручную...");
console.log("⏰ Время запуска:", new Date().toISOString());

executeInstagramAnalysis(mastra)
  .then((result) => {
    console.log("✅ Анализ завершен успешно!");
    console.log("📊 Результаты:", JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Ошибка при анализе:", error);
    process.exit(1);
  });
