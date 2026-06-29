-- Row Level Security for turnover board tables.
-- Dashboard reads via anon key (read-only). Writes require service role key (sync script only).

alter table turnovers              enable row level security;
alter table turnover_work_orders   enable row level security;

create policy "anon can read turnovers"
  on turnovers for select
  to anon
  using (true);

create policy "anon can read turnover_work_orders"
  on turnover_work_orders for select
  to anon
  using (true);
