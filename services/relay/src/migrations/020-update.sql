---------------------------------------------------------------------
-- nodes table
---------------------------------------------------------------------
-- add unique uid index (uid = agentAlias/deviceId/dataitemId)
CREATE UNIQUE INDEX IF NOT EXISTS nodes_uid ON nodes ((props->>'uid'));

---------------------------------------------------------------------
-- views
---------------------------------------------------------------------

DROP VIEW IF EXISTS devices;  -- because `create or replace` isn't enough!
CREATE OR REPLACE VIEW devices AS
SELECT
  nodes.node_id,
  nodes.props->>'id' as id,
  nodes.props->>'uid' as uid, -- ie `agentAlias/deviceId`, eg 'main/d1'
  nodes.props->>'uuid' as uuid, -- a 'supposedly' unique id, but depends on agent.xml developer
  nodes.props->>'path' as path,
  nodes.props->>'shortPath' as shortpath,
  nodes.props->>'name' as name
  nodes.props as props
FROM 
  nodes
WHERE
  nodes.props->>'node_type'='Device';


--. call this tags?
DROP VIEW IF EXISTS dataitems;  -- because `create or replace` isn't enough!
CREATE OR REPLACE VIEW dataitems AS
SELECT
  nodes.node_id,
  -- nodes.props->>'id' as id,
  -- nodes.props->>'uid' as uid, -- ie `agentAlias/deviceId/dataitemId`, eg 'main/d1/avail'
  nodes.props->>'path' as path, -- eg 'main/d1/availability'
  nodes.props->>'category' as category, 
  nodes.props->>'type' as type,
  nodes.props->>'subType' as subtype,
  nodes.props->>'units' as units,
  nodes.props->>'nativeUnits' as nativeunits,
  nodes.props->>'statistic' as statistic,
  nodes.props as props
FROM 
  nodes
WHERE
  nodes.props->>'node_type'='DataItem'; --. or Tag, if go that way

