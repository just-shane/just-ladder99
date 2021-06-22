// database class
// wraps postgres/timescaledb/timegraph db

import pg from 'pg' // postgres driver https://github.com/brianc/node-postgres
const { Pool } = pg // import { Client } from 'pg' gives error, so must do this
import * as libapp from './libapp.js'

export class Db {
  constructor() {
    this.client = null
  }

  async start() {
    await this.connect()
    this.init()
    await this.migrate()
  }

  async connect() {
    let client = null
    const pool = new Pool()
    do {
      try {
        const params = {
          host: process.env.PGHOST,
          port: process.env.PGPORT,
          database: process.env.PGDATABASE,
        }
        console.log(`Trying to connect to db...`, params)
        client = await pool.connect() // uses envars PGHOST, PGPORT etc
      } catch (error) {
        console.log(`Error ${error.code} - will sleep before retrying...`)
        console.log(error)
        await libapp.sleep(4000)
      }
    } while (!client)
    this.client = client
  }

  init() {
    const that = this

    //. need init:true in compose yaml to get SIGINT etc? tried - nowork
    process
      .on('SIGTERM', getShutdown('SIGTERM'))
      .on('SIGINT', getShutdown('SIGINT'))
      .on('uncaughtException', getShutdown('uncaughtException'))

    // get shutdown handler
    function getShutdown(signal) {
      return error => {
        console.log()
        console.log(`Signal ${signal} received - shutting down...`)
        if (error) console.error(error.stack || error)
        that.disconnect()
        process.exit(error ? 1 : 0)
      }
    }
  }

  disconnect() {
    if (!this.client) {
      console.log(`Releasing db client...`)
      this.client.release()
    }
  }

  //. handle versions - use meta table
  async migrate() {
    const sql = `
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Adding a primary key will automatically create a unique B-tree index on
-- the column or group of columns listed in the primary key, and will force
-- the column(s) to be marked NOT NULL.
CREATE TABLE IF NOT EXISTS meta (
  name text PRIMARY KEY,
  value jsonb
);

CREATE TABLE IF NOT EXISTS nodes (
  node_id integer PRIMARY KEY,
  props jsonb
);
-- CREATE INDEX nodes_type ON nodes (props.type);

CREATE TABLE IF NOT EXISTS edges (
  from_id integer REFERENCES nodes,
  to_id integer REFERENCES nodes,
  props jsonb
);

CREATE TABLE IF NOT EXISTS history (
  node_id integer REFERENCES nodes,
  property_id REFERENCES nodes,
  time timestamptz NOT NULL,
  value jsonb
);
SELECT create_hypertable('history', 'time', if_not_exists => TRUE);

-- note: float is an alias for 'double precision'
-- .will want to join with nodes table to get props.path, eh?
CREATE OR REPLACE VIEW history_float
AS SELECT time, _id, value::float
FROM history
WHERE jsonb_typeof(value) = 'number'::text;
`
    console.log(`Migrating database structures...`)
    await this.client.query(sql)
  }

  async query(sql) {
    return await this.client.query(sql)
  }

  // //. read nodes and edges into graph structure
  // async getGraph(Graph) {
  //   const graph = new Graph()
  //   const sql = `SELECT * FROM nodes;`
  //   const res = await this.client.query(sql)
  //   const nodes = res.rows // [{ _id, props }]
  //   console.log(nodes)
  //   for (const node of nodes) {
  //     graph.addNode(node)
  //   }
  //   //. get edges also
  //   return graph
  // }
}
