-- Creates two tables for the visual turnover board.
-- Includes the shared trigger function in case migration 001 was not run in this database.

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists turnovers (
  id                 uuid        primary key default gen_random_uuid(),
  appfolio_unit_id   text        unique not null,
  property_name      text        not null,
  unit_number        text        not null,
  status             text        not null
                       check (status in ('pending_moveout','active_turnover','down_unit','ready_to_rent')),
  move_out_date      date,
  move_in_date       date,
  utilities          jsonb       not null default '{}',
  days_vacant        integer     not null default 0,
  last_synced_at     timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists turnover_work_orders (
  id                 uuid        primary key default gen_random_uuid(),
  turnover_id        uuid        not null references turnovers(id) on delete cascade,
  appfolio_wo_id     text        unique not null,
  category           text        not null default 'other',
  raw_title          text        not null,
  status             text        not null
                       check (status in ('pending','scheduled','in_progress','completed','not_needed')),
  scheduled_date     date,
  completed_date     date,
  vendor             text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_turnovers_status         on turnovers(status);
create index if not exists idx_turnovers_move_out_date  on turnovers(move_out_date);
create index if not exists idx_twork_orders_turnover_id on turnover_work_orders(turnover_id);
create index if not exists idx_twork_orders_category    on turnover_work_orders(category);

create trigger turnovers_updated_at
  before update on turnovers
  for each row execute procedure update_updated_at_column();

create trigger turnover_work_orders_updated_at
  before update on turnover_work_orders
  for each row execute procedure update_updated_at_column();
