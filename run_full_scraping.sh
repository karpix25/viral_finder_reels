#!/bin/bash
echo "🚀 Запуск полного скрапинга 1000 аккаунтов..."
echo "📊 Текущий прогресс: 80/1000"
echo ""

RUNS=0
MAX_RUNS=20  # 50 аккаунтов * 20 запусков = 1000 аккаунтов

while [ $RUNS -lt $MAX_RUNS ]; do
  RUNS=$((RUNS + 1))
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📍 Запуск #$RUNS из $MAX_RUNS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  npx tsx -e "
    import { mastra } from './src/mastra/index';
    import { executeInstagramAnalysis } from './src/mastra/workflows/instagramAnalysisWorkflow';
    
    executeInstagramAnalysis(mastra)
      .then((result) => {
        console.log('✅ Обработано:', result.totalAccountsProcessed);
        console.log('📨 Найдено вирусных:', result.totalViralReelsSent);
      })
      .catch((error) => {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
      });
  " 2>&1 | tail -20
  
  # Небольшая пауза между запусками
  sleep 3
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ СКРАПИНГ ЗАВЕРШЁН!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
