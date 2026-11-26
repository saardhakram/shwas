-- Restrict public.groups SELECT access to group members & creators only,
-- and provide a SECURITY DEFINER RPC `join_group_by_code` for joining via a 6-character code.
-- Apply manually in the Supabase SQL Editor (do not run automatically).

create or replace function public.join_group_by_code(
  code text,
  display_name text default 'Family'
)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_display text := left(coalesce(nullif(trim(display_name), ''), 'Family'), 60);
  v_group public.groups;
begin
  if v_user_id is null then
    raise exception 'Authentication required to join a group';
  end if;

  if char_length(v_code) <> 6 then
    raise exception 'Join code must be 6 alphanumeric characters';
  end if;

  select *
    into v_group
    from public.groups g
   where g.join_code = v_code
   limit 1;

  if not found then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  insert into public.group_members (group_id, user_id, display_name)
  values (v_group.id, v_user_id, v_display)
  on conflict (group_id, user_id)
  do update set display_name = excluded.display_name;

  return v_group;
end;
$$;

revoke execute on function public.join_group_by_code(text, text) from public, anon;
grant execute on function public.join_group_by_code(text, text) to authenticated;

-- Tighten groups SELECT policy: only members or the creator can read a group row and its join_code
drop policy if exists "Authenticated users can read groups" on public.groups;
drop policy if exists "Members or creator can read groups" on public.groups;
create policy "Members or creator can read groups"
  on public.groups
  for select
  to authenticated
  using (created_by = auth.uid() or public.is_group_member(id));
