// mqtt-json
// adapter plugiin - subscribes to mqtt topics, receives messages,
// parses them out as JSON, updates cache values, which sends SHDR.

import libmqtt from 'mqtt' // see https://www.npmjs.com/package/mqtt

/**
 * initialize the client plugin.
 * queries the device for address space definitions, subscribes to topics.
 * inputs is the inputs.yaml file parsed to a js tree.
 */
export function init({ url, cache, deviceId, inputs }) {
  console.log('init', { deviceId })

  // connect to broker
  console.log(`MQTT connecting to broker on ${url}...`)
  const mqtt = libmqtt.connect(url)

  // handle connection
  mqtt.on('connect', function onConnect() {
    console.log(`MQTT connected to broker on ${url}`)

    // handle all incoming messages
    console.log(`MQTT registering generic message handler`)
    mqtt.on('message', onMessage)

    // subscribe to any topics defined
    for (const entry of inputs.connect.subscribe) {
      const topic = replaceDeviceId(entry.topic)
      console.log(`MQTT subscribing to ${topic}`)
      mqtt.subscribe(topic)
    }

    // publish to any topics defined
    for (const entry of inputs.connect.publish) {
      const topic = replaceDeviceId(entry.topic)
      console.log(`MQTT publishing to ${topic}`)
      mqtt.publish(topic, entry.message)
    }

    console.log(`MQTT listening for messages...`)
  })

  /**
   * handle all incoming messages.
   * eg for ccs-pa, could have query, status, and read messages.
   * @param {string} msgTopic - mqtt topic, eg 'l99/ccs-pa-001/evt/query'
   * @param {array} msgBuffer - array of bytes (assumed to be a json string)
   */
  function onMessage(msgTopic, msgBuffer) {
    console.log('MQTT got message on topic', msgTopic)

    // unpack the mqtt json payload, assuming it's a JSON string.
    // gets payload as variable - used by handler.initialize - don't delete - @ts-ignore
    const payload = JSON.parse(msgBuffer.toString())

    // iterate over message handlers - handlers is an array of [topic, handler].
    const handlers = Object.entries(inputs.handlers) || []
    let msgHandled = false
    handlers.forEach(([topic, handler]) => {
      topic = replaceDeviceId(topic)

      if (topic === msgTopic) {
        // unsubscribe from topics as needed
        for (const entry of handler.unsubscribe || []) {
          const topic = replaceDeviceId(entry.topic)
          console.log(`MQTT unsubscribe from ${topic}`)
          mqtt.unsubscribe(topic)
        }

        // initialize handler
        console.log(`MQTT initialize handler`)
        // eg assign payload values to a dictionary $, for fast lookups.
        // eg initialize: 'payload.forEach(item => $[item.keys[0]] = item)'
        let $ = {} // a variable representing payload data
        eval(handler.initialize)

        // define lookup function
        console.log(`MQTT define lookup function`)
        // eg lookup: '($, part) => ({ value: ($[part] || {}).default })'
        const lookup = eval(handler.lookup) // get the function itself

        // iterate over inputs - if part is in the payload, add it to the cache.
        console.log(`MQTT iterate over inputs`)
        // inputs is array of [key, part], eg ['fault_count', '%M55.2'].
        const inputs = Object.entries(handler.inputs) || []
        for (const [key, part] of inputs) {
          // use the lookup function to get item from payload, if there
          const item = lookup($, part)
          // if we have the part in the payload, add it to the cache
          if (item && item.value !== undefined) {
            const cacheId = deviceId + '-' + key // eg 'ccs-pa-001-fault_count'
            cache.set(cacheId, item) // save to the cache - may send shdr to tcp
          }
        }

        // subscribe to any topics
        for (const entry of handler.subscribe || []) {
          const topic = replaceDeviceId(entry.topic)
          console.log(`MQTT subscribe to ${topic}`)
          mqtt.subscribe(topic)
        }

        msgHandled = true
      }
    })

    if (!msgHandled) {
      console.log(`MQTT WARNING: no handler for topic`, msgTopic)
    }
  }

  function replaceDeviceId(str) {
    return str.replace('${deviceId}', deviceId)
  }
}
