-- SQL Script: Create tables for client-specific variant costs and additional costs

-- 1. Variant Costs Table
CREATE TABLE IF NOT EXISTS public.car_variant_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL,
    cost NUMERIC NOT NULL DEFAULT 0,
    packaging_cost NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_profile_variant UNIQUE (profile_id, variant_id)
);

-- Enable RLS for variant costs
ALTER TABLE public.car_variant_costs ENABLE ROW LEVEL SECURITY;

-- Policies for variant costs
CREATE POLICY "Users can select their own variant costs" 
    ON public.car_variant_costs FOR SELECT 
    USING (auth.uid() = profile_id);

CREATE POLICY "Users can insert their own variant costs" 
    ON public.car_variant_costs FOR INSERT 
    WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can update their own variant costs" 
    ON public.car_variant_costs FOR UPDATE 
    USING (auth.uid() = profile_id);

CREATE POLICY "Users can delete their own variant costs" 
    ON public.car_variant_costs FOR DELETE 
    USING (auth.uid() = profile_id);

-- 2. Additional/Fixed Costs Table
CREATE TABLE IF NOT EXISTS public.car_additional_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('equipo', 'otros', 'campanas')),
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    cost NUMERIC NOT NULL DEFAULT 0,
    daily_cost NUMERIC NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'LOCAL',
    ad_spend BOOLEAN NOT NULL DEFAULT false,
    platform TEXT NOT NULL DEFAULT '-',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for additional costs
ALTER TABLE public.car_additional_costs ENABLE ROW LEVEL SECURITY;

-- Policies for additional costs
CREATE POLICY "Users can select their own additional costs" 
    ON public.car_additional_costs FOR SELECT 
    USING (auth.uid() = profile_id);

CREATE POLICY "Users can insert their own additional costs" 
    ON public.car_additional_costs FOR INSERT 
    WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can update their own additional costs" 
    ON public.car_additional_costs FOR UPDATE 
    USING (auth.uid() = profile_id);

CREATE POLICY "Users can delete their own additional costs" 
    ON public.car_additional_costs FOR DELETE 
    USING (auth.uid() = profile_id);
