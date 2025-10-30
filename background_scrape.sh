#!/bin/bash
exec > scraping_full.log 2>&1

echo "🚀 ФОНОВЫЙ СКРАПИНГ ЗАПУЩЕН: $(date)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for i in {1..20}; do
  echo ""
  echo "📍 Партия #$i/20 | Время: $(date +%H:%M:%S)"
  
  npx tsx -e "
    import { mastra } from './src/mastra/index';
    import { executeInstagramAnalysis } from './src/mastra/workflows/instagramAnalysisWorkflow';
    executeInstagramAnalysis(mastra)
      .then(r => console.log('✅ Обработано:', r.totalAccountsProcessed, '| Вирусных:', r.totalViralReelsSent))
      .catch(e => console.error('❌', e.message));
  "
  
  sleep 5
done

echo ""
echo "🎉 СКРАПИНГ ЗАВЕРШЁН: $(date)"
