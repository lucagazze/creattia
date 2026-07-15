import { scanWebsite, analyzeCatalogWithAI } from '../src/lib/creattia/catalog-scanner.js';

async function test() {
  const url = 'https://creattia.vercel.app';
  console.log(`Scanning url: ${url}...`);
  try {
    const source = await scanWebsite(url);
    console.log('Scan successful, products found:', source.products.length);
    console.log('Running analyzeCatalogWithAI...');
    const analysis = await analyzeCatalogWithAI({
      sources: [source],
      products: source.products,
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log('Analysis successful:', JSON.stringify(analysis, null, 2));
  } catch (err) {
    console.error('Error during test:', err);
  }
}

test();
