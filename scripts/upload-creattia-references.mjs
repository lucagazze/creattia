import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const envFiles = ['.env.local', '.env.production.local', '.env.pulled.local', '.env.pulled.production'];

for (const file of envFiles) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.CREATTIA_REFERENCES_BUCKET || 'creattia-ad-references';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in local env files.');
}

const references = [
  {
    file: '/Users/lucagazze/Downloads/126626053866233-image.jpg',
    archetype: 'personalized_product_story',
    industry: 'jewelry',
    angle: 'emotional personalization',
    ring: 'desire',
    layout: 'soft lifestyle macro with testimonial card overlay and elegant product close-up',
    promptNotes: 'Use intimate product close-up, soft skin/material texture, premium typography-safe blank area, emotional gift/personalization mood.',
  },
  {
    file: '/Users/lucagazze/Downloads/176961971914768-image.jpg',
    archetype: 'benefit_stack_beauty',
    industry: 'beauty supplement',
    angle: 'clear benefits',
    ring: 'desire',
    layout: 'pastel product hero with ingredient cue, checklist benefits, badge, and CTA-safe bottom band',
    promptNotes: 'Use bright pastel set, ingredient cue, refreshing texture, product centered, clean benefit-stack composition.',
  },
  {
    file: '/Users/lucagazze/Downloads/251903170977343-image.jpg',
    archetype: 'regret_problem_packaged_good',
    industry: 'food',
    angle: 'problem/anti-regret',
    ring: 'pain',
    layout: 'bold headline top, product pack hero, testimonial proof, nutrition/benefit tiles',
    promptNotes: 'Use playful packaged goods hero, bold contrast, proof blocks and ingredient/nutrition cues without making it cluttered.',
  },
  {
    file: '/Users/lucagazze/Downloads/280005771461550-image.jpg',
    archetype: 'red_product_authority',
    industry: 'skincare',
    angle: 'expert curation',
    ring: 'authority',
    layout: 'solid brand-color background, product trio, clear hierarchy, certification/proof copy zones',
    promptNotes: 'Use strong single-color backdrop, product lineup, premium clinical beauty lighting, authority/proof feeling.',
  },
  {
    file: '/Users/lucagazze/Downloads/302547462334428-image.jpg',
    archetype: 'why_choose_feature_callouts',
    industry: 'baby',
    angle: 'feature comparison',
    ring: 'mechanism',
    layout: 'product in hand, multiple feature callouts around hero object, soft trustworthy color palette',
    promptNotes: 'Use product held in human hand, clean feature callout areas, trustworthy soft ecommerce look.',
  },
  {
    file: '/Users/lucagazze/Downloads/350773640628806-image.jpg',
    archetype: 'ugc_problem_question',
    industry: 'wellness',
    angle: 'relatable question',
    ring: 'pain',
    layout: 'native UGC photo with large overlaid question/problem statement',
    promptNotes: 'Use candid creator-style scene, relatable human moment, simple bold overlay area, phone-native crop.',
  },
  {
    file: '/Users/lucagazze/Downloads/802670957785082-image.jpg',
    archetype: 'catalog_advertorial_product',
    industry: 'fashion',
    angle: 'product education',
    ring: 'proof',
    layout: 'magazine/product catalog page with large product image, specs, swatches, and trust icons',
    promptNotes: 'Use editorial catalog composition, product full view, swatches/options area, credibility badges as abstract shapes only.',
  },
  {
    file: '/Users/lucagazze/Downloads/1359229744752579-image.jpg',
    archetype: 'versus_upgrade',
    industry: 'personal care',
    angle: 'comparison upgrade',
    ring: 'mechanism',
    layout: 'two products side-by-side, gradient background, upgrade headline area, hand interaction',
    promptNotes: 'Use clean versus composition, improved product visually superior, hand/action cue, colorful gradient set.',
  },
  {
    file: '/Users/lucagazze/Downloads/1302999273938148-image.jpg',
    archetype: 'sticky_note_objections',
    industry: 'personal care',
    angle: 'objection labels',
    ring: 'pain',
    layout: 'bathroom/product scene with sticky notes naming problems above variants',
    promptNotes: 'Use real-life product lineup, sticky-note inspired problem markers, playful but polished bathroom set.',
  },
  {
    file: '/Users/lucagazze/Downloads/1264543891155744-image.jpg',
    archetype: 'benefit_stack_beauty_variant',
    industry: 'beauty supplement',
    angle: 'fast visible result',
    ring: 'desire',
    layout: 'pastel product hero with large result headline, fruit/ingredient cue, badge, CTA band',
    promptNotes: 'Use fresh pink/orange set, glowing result mood, ingredient cue, clean vertical direct-response layout.',
  },
  {
    file: '/Users/lucagazze/Downloads/1048898986147523-image.jpg',
    archetype: 'nostalgia_without_tradeoff',
    industry: 'food',
    angle: 'nostalgia plus health',
    ring: 'desire',
    layout: 'nostalgic headline, product pack hero, benefit checklist, playful badge',
    promptNotes: 'Use nostalgic packaged-good set, warm playful colors, benefit checklist structure, craving without guilt mood.',
  },
  {
    file: '/Users/lucagazze/Downloads/871174521035157-image.jpg',
    archetype: 'lifestyle_product_hero',
    industry: 'fashion accessory',
    angle: 'aspirational style',
    ring: 'desire',
    layout: 'premium lifestyle crop, product worn/in-use, short headline zone',
    promptNotes: 'Use premium accessory lifestyle shot, human body crop, refined lighting, aspirational product hero.',
  },
  {
    file: '/Users/lucagazze/Downloads/807467104208206-image.jpg',
    archetype: 'sticky_note_proof',
    industry: 'personal care',
    angle: 'proof checklist',
    ring: 'proof',
    layout: 'product close-up with sticky note proof points in casual handwriting style',
    promptNotes: 'Use native proof note composition, product in bathroom/use context, believable review-like proof cues.',
  },
  {
    file: '/Users/lucagazze/Downloads/682117620525783-image (1).jpg',
    archetype: 'seasonal_problem_offer',
    industry: 'home fragrance',
    angle: 'seasonal problem',
    ring: 'pain',
    layout: 'seasonal dark background, urgent headline strips, product jar hero',
    promptNotes: 'Use cozy seasonal scene, strong problem headline zone, product hero foreground, warm lights.',
  },
  {
    file: '/Users/lucagazze/Downloads/682117620525783-image.jpg',
    archetype: 'seasonal_problem_offer_duplicate',
    industry: 'home fragrance',
    angle: 'seasonal problem',
    ring: 'pain',
    layout: 'seasonal dark background, urgent headline strips, product jar hero',
    promptNotes: 'Use cozy seasonal scene, strong problem headline zone, product hero foreground, warm lights.',
  },
  {
    file: '/Users/lucagazze/Downloads/779457413463974-image.jpg',
    archetype: 'body_result_lifestyle',
    industry: 'body care',
    angle: 'visible result',
    ring: 'desire',
    layout: 'body/lifestyle crop, product in hand, subtle benefit annotations',
    promptNotes: 'Use premium body-care lifestyle crop, product held naturally, confident result mood, minimal annotation areas.',
  },
  {
    file: '/Users/lucagazze/Downloads/2047120705458135-image.jpg',
    archetype: 'comparison_table',
    industry: 'supplement',
    angle: 'us-vs-alternative',
    ring: 'mechanism',
    layout: 'two-column comparison over product/ingredient background with clear check/cross zones',
    promptNotes: 'Use split comparison board, product/ingredient texture background, clean table zones without readable text.',
  },
  {
    file: '/Users/lucagazze/Downloads/1461562418035353-image.jpg',
    archetype: 'heat_level_authority',
    industry: 'food condiment',
    angle: 'product differentiation',
    ring: 'mechanism',
    layout: 'product bottle hero with food/action background and stacked proof labels',
    promptNotes: 'Use dramatic food scene, bottle/product hero, stacked proof label zones, high appetite lighting.',
  },
  {
    file: '/Users/lucagazze/Downloads/1368455227398266-image.jpg',
    archetype: 'memory_without_tradeoff',
    industry: 'food',
    angle: 'nostalgia objection',
    ring: 'desire',
    layout: 'product pack hero, nostalgic headline zone, testimonial/proof card, nutrition tiles',
    promptNotes: 'Use nostalgia-driven packaged food hero, warm cream background, proof card and benefit tiles.',
  },
];

function sipsDimensions(file) {
  const output = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  const width = Number(output.match(/pixelWidth:\s*(\d+)/)?.[1] || 0);
  const height = Number(output.match(/pixelHeight:\s*(\d+)/)?.[1] || 0);
  return { width, height, aspectRatio: width && height ? Number((width / height).toFixed(4)) : null };
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: buckets, error: listError } = await supabase.storage.listBuckets();
if (listError) throw listError;
if (!buckets?.some((bucket) => bucket.name === BUCKET)) {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/json'],
  });
  if (error) throw error;
}

const uploaded = [];
for (let index = 0; index < references.length; index += 1) {
  const ref = references[index];
  const fileBuffer = fs.readFileSync(ref.file);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const ext = path.extname(ref.file).toLowerCase() || '.jpg';
  const filename = `${String(index + 1).padStart(2, '0')}-${slugify(ref.archetype)}-${hash.slice(0, 10)}${ext}`;
  const storagePath = `references/${filename}`;
  const { width, height, aspectRatio } = sipsDimensions(ref.file);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: ext === '.png' ? 'image/png' : 'image/jpeg',
      upsert: true,
    });
  if (uploadError) throw uploadError;
  const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  uploaded.push({
    id: hash.slice(0, 16),
    sourceFile: path.basename(ref.file),
    storageBucket: BUCKET,
    storagePath,
    publicUrl: publicUrl.publicUrl,
    width,
    height,
    aspectRatio,
    ...ref,
    file: undefined,
  });
}

const catalog = {
  version: 1,
  createdAt: new Date().toISOString(),
  source: 'user-provided-downloads',
  usage: 'reference-patterns-for-new-ai-generated-creatives',
  count: uploaded.length,
  references: uploaded,
};

const catalogBuffer = Buffer.from(JSON.stringify(catalog, null, 2));
const { error: catalogError } = await supabase.storage
  .from(BUCKET)
  .upload('catalog/creattia-ad-references.json', catalogBuffer, {
    contentType: 'application/json',
    upsert: true,
  });
if (catalogError) throw catalogError;

const { error: tableError } = await supabase
  .from('creattia_ad_references')
  .upsert(uploaded.map((ref) => ({
    id: ref.id,
    source_file: ref.sourceFile,
    storage_bucket: ref.storageBucket,
    storage_path: ref.storagePath,
    public_url: ref.publicUrl,
    width: ref.width,
    height: ref.height,
    aspect_ratio: ref.aspectRatio,
    archetype: ref.archetype,
    industry: ref.industry,
    angle: ref.angle,
    ring: ref.ring,
    layout: ref.layout,
    prompt_notes: ref.promptNotes,
    metadata: ref,
  })), { onConflict: 'id' });

if (tableError) {
  console.warn(`Storage upload complete, but table upsert failed: ${tableError.message}`);
  console.warn('Run supabase_creattia_ad_references.sql in Supabase, then rerun this script to populate the table.');
}

console.log(JSON.stringify({
  bucket: BUCKET,
  uploaded: uploaded.length,
  catalogPath: 'catalog/creattia-ad-references.json',
  tableUpsert: !tableError,
}, null, 2));
