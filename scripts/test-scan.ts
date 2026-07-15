import { extractProductPageWithAI } from '../src/lib/creattia/catalog-scanner';

async function test() {
  const url = 'https://creattia.vercel.app';
  console.log(`Running AI-first extraction on: ${url}...`);
  try {
    const product = await extractProductPageWithAI(url, process.env.OPENAI_API_KEY || '');
    console.log('Product Extracted successfully!');
    console.log(JSON.stringify(product, null, 2));
  } catch (err) {
    console.error('Error during test:', err);
  }
}

test();
