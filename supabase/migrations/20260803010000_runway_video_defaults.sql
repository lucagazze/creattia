-- New video generations call Gemini Omni Flash Video-to-Video directly.
-- Existing OpenAI/Sora rows remain readable for backwards compatibility.
alter table if exists public.creative_video_generations
  alter column provider set default 'gemini',
  alter column model set default 'gemini-omni-flash-preview';
