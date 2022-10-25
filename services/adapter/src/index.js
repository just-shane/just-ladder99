// adapter
// poll or subscribe to data via plugins, update cache,
// update shdr strings, pass them to agent via tcp.

import * as lib from './common/lib.js'
import { Cache } from './cache.js'
import { setupDevice } from './setupDevice.js'
import { getPlugin } from './helpers.js'

console.log()
console.log(`Ladder99 Adapter`)
console.log(`Polls/subscribes to data, writes to cache, transforms to SHDR,`)
console.log(`posts to Agent via TCP.`)
console.log(new Date().toISOString())
console.log(`----------------------------------------------------------------`)

// get params - typically set in compose.yaml and compose-overrides.yaml files
const params = {
  // default tcp server for agent if none provided in setup.yaml
  //. move to base setup
  defaultAgent: { protocol: 'shdr', host: 'adapter', port: 7878 },
  // file system inputs
  driversFolder: './drivers', // eg for mqttSubscriber.js - must start with '.'
  // these folders may be defined in compose.yaml with docker volume mappings.
  // when adapter.js is run, it expects config in /data/setup and /data/models.
  // so /data/setup includes setup.yaml, which includes a list of devices to setup.
  //. could also contain custom adapter drivers and modules, eg for oxbox.
  setupFolder: process.env.L99_SETUP_FOLDER || `/data/setup`,
  modulesFolder: process.env.L99_MODULES_FOLDER || `/data/modules`, // incls print-apply/module.xml etc
}

async function start(params) {
  //
  // read client setup.yaml file
  const setup = lib.readSetup(params.setupFolder)

  // define cache shared across all devices and sources
  const cache = new Cache()

  // load any shared providers
  // eg setup.yaml/adapter/providers = { sharedMqtt: { driver, url }, ... }
  const providers = setup.adapter?.providers || {}
  for (const provider of Object.values(providers)) {
    console.log(`Adapter get shared provider`, provider)
    // import driver plugin - instantiates a new instance of the AdapterDriver class
    const plugin = await getPlugin(params.driversFolder, provider.driver) // eg 'mqttProvider'
    // AWAIT here until provider is connected?
    plugin.start({ provider }) // start driver - eg this connects to the mqtt broker
    // await plugin.start({ provider }) // start driver - eg this connects to the mqtt broker
    provider.plugin = plugin // save plugin to this provider object, eg { driver, url, plugin }
  }

  // iterate over device definitions from setup.yaml file and do setup for each
  const client = setup.client || {}
  // const devices = setup.devices || [] //. develop branch
  const devices = setup?.adapter?.devices || [] //. historian branch - careful with merge here
  for (const device of devices) {
    setupDevice({ setup, params, device, cache, client, devices, providers })
  }
}

start(params)
