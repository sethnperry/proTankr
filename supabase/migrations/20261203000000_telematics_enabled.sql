-- One switch per company for telematics. The connection (login, vehicle links) stays; turning this off stops every
-- server read of the tracker (hours, positions, odometer, fuel, engine hours, IFTA, the 5-minute jobs) and every client
-- poll, without disconnecting. Default on, so a connected company behaves as before.
alter table public.telematics_connections add column if not exists enabled boolean not null default true;
