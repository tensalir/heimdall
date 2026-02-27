-- Update default_creative_partners to include both Studio and Content Creation
-- so the Ops board filters show both Figma-relevant partners by default.

alter table ops_boards
  alter column default_creative_partners
  set default '{"Studio","Content Creation"}';

-- Backfill existing boards that only had the old default
update ops_boards
set default_creative_partners = '{"Studio","Content Creation"}'
where default_creative_partners = '{"Studio"}';
