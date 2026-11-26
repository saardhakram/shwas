-- Restrict public.is_group_member helper so anonymous/public roles cannot probe membership.
-- (Already applied in production; kept here for complete migration history.)

revoke execute on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
