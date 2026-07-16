// Prueba local del análisis de estilo de marca.
// Uso: npx tsx --env-file=.env.local scripts/dev-test-brand-style.mts [url]
import { analyzeBrandStyle } from '../src/lib/creattia/brand-style';

const url = process.argv[2] || 'https://www.theskirtingfactoryllc.com';
const style = await analyzeBrandStyle(url, process.env.OPENAI_API_KEY);
console.log(JSON.stringify(style, null, 2));
