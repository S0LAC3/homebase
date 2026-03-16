DROP POLICY IF EXISTS "Advisors can view buyer profiles" ON public.profiles;

CREATE POLICY "Advisors can view buyer profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR
    EXISTS (
      SELECT 1 FROM public.advisor_access
      WHERE advisor_id = auth.uid() AND buyer_id = profiles.id
    )
  );
