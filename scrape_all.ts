import { mastra } from './src/mastra/index';
import { executeInstagramAnalysis } from './src/mastra/workflows/instagramAnalysisWorkflow';
import { db } from './src/mastra/storage';
import { workflowProgress } from './src/mastra/storage/schema';
import { eq } from 'drizzle-orm';

async function scrapeAll() {
  console.log('🚀 ПОЛНЫЙ СКРАПИНГ 1000 АККАУНТОВ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let iteration = 0;
  const TOTAL_ACCOUNTS = 1000;

  while (true) {
    iteration++;
    
    // Проверяем текущий прогресс
    const progress = await db
      .select()
      .from(workflowProgress)
      .where(eq(workflowProgress.workflowName, 'instagram-viral-analysis'))
      .limit(1);

    const currentIndex = progress[0]?.lastProcessedIndex || 0;
    
    if (currentIndex >= TOTAL_ACCOUNTS) {
      console.log('\n✅ ВСЕ АККАУНТЫ ОБРАБОТАНЫ!');
      console.log(`📊 Всего: ${currentIndex}/${TOTAL_ACCOUNTS}`);
      break;
    }

    const remaining = TOTAL_ACCOUNTS - currentIndex;
    console.log(`\n📍 Итерация #${iteration}`);
    console.log(`📊 Прогресс: ${currentIndex}/${TOTAL_ACCOUNTS} (осталось: ${remaining})`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      const result = await executeInstagramAnalysis(mastra);
      
      console.log(`✅ Обработано: ${result.totalAccountsProcessed} аккаунтов`);
      console.log(`📨 Найдено вирусных: ${result.totalViralReelsSent} постов`);
      
      // Пауза между итерациями
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error: any) {
      console.error(`❌ Ошибка в итерации #${iteration}:`, error.message);
      console.log('⏭️ Продолжаю со следующей партии...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 СКРАПИНГ ЗАВЕРШЁН!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  process.exit(0);
}

scrapeAll().catch((error) => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
