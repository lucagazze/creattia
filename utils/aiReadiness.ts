export const AI_BRAIN_STEPS = [
  'Entrá a Cerebro IA.',
  'Cargá la web, datos del negocio y contexto importante.',
  'Tocá Escanear y Entrenar o guardá el Cerebro.',
];

export const isAIBrainReady = (profile: any) => {
  if (!profile) return false;

  const hasSavedBrain = Boolean(profile.brain_updated_at);
  const hasContext = Boolean(
    String(profile.business_description || '').trim() ||
    String(profile.scraped_content || '').trim() ||
    String(profile.instagram_context || '').trim() ||
    String(profile.custom_instructions || '').trim()
  );

  return hasSavedBrain && hasContext;
};
