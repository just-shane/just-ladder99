// tapedeck
// play/record MQTT messages
// inspired by rpdswtk/mqtt_recorder, a python app
// currently pass params by envars, except mode=play/record pass on cmdline

import fs from 'fs'
import mqttlib from 'mqtt' // see https://github.com/mqttjs/MQTT.js
import parse from 'csv-parse/lib/sync.js' // see https://github.com/adaltas/node-csv-parse
// @ts-ignore
import { Command } from 'commander/esm.mjs' // see https://github.com/tj/commander.js

const program = new Command()

program
  .option('-h, --host <host>', 'mqtt host', 'localhost')
  .option('-p, --port <port>', 'mqtt port', 1883)
  .option('-m, --mode <mode>', 'play or record', 'play')
  .option('-l, --loop <loop>', 'play in a loop', true)
  .option('-t, --topic <topic>', 'topic to subscribe to', '#')
  .option('-f, --folder <folder>', 'folder containing csv files', 'recordings')

program.parse(process.argv)

const options = program.opts()

const { host, port, mode, loop, topic, folder } = options

// const host = process.env.HOST || 'localhost'
// const port = Number(process.env.PORT || 1883)
// const mode = process.env.MODE || 'play'
// const loop = Boolean(process.env.LOOP || false)
// const topics = process.env.TOPICS || '#'
// const folder = '/etc/tapedeck' // must match that in compose.yaml

console.log()
console.log(`Tapedeck`)
console.log(`Play/record MQTT messages`)
console.log(`------------------------------------------------------------`)

const clientId = `tapedeck-${Math.random()}`
const config = { host, port, clientId }

console.log(`Connecting to MQTT broker on`, config)
const mqtt = mqttlib.connect(config)

mqtt.on('connect', async function onConnect() {
  console.log(`Connected...`)

  const columns = 'topic,payload,qos,retain,time_now,time_delta'.split(',')

  if (mode === 'play') {
    console.log(`Playback mode`)

    console.log(`Reading list of files in folder '${folder}'...`)
    // const simulationsFolder = `${modelsFolder}/${model}/simulations` //.
    let csvfiles
    try {
      csvfiles = fs
        .readdirSync(folder)
        .filter(csvfile => csvfile.endsWith('.csv'))
        .sort()
    } catch (error) {
      console.log(`Problem reading files - does the folder exist?`)
      process.exit(1)
    }
    if (csvfiles.length === 0) {
      console.log(`No csv files found in folder.`)
      process.exit(1)
    }

    // do while loop
    do {
      console.log(`Looping over files...`)
      for (const csvfile of csvfiles) {
        const csvpath = `${folder}/${csvfile}`
        console.log(`Reading ${csvpath}...`)
        const csv = await fs.readFileSync(csvpath)
        const rows = parse(csv, { columns })
        for (const row of rows) {
          const { payload, qos, retain, time_delta } = row
          // const topic = row.topic.replace('${deviceId}', deviceId) //. handle this
          const topic = row.topic
          console.log(`Publishing topic ${topic}: ${payload.slice(0, 40)}...`)
          // mqtt.publish(topic, payload)
          mqtt.publish(topic, payload, { qos, retain })
          await sleep(time_delta * 1000) // pause between messages
        }
        await sleep(1000) // pause between csv files
      }
      await sleep(1000) // pause between loops
    } while (loop)
  } else {
    console.log(`Record mode`)

    console.log(`Subscribing to MQTT topics (${topic})...`)
    mqtt.subscribe(topic, null, onSubscribe)

    let fd // file descriptor

    // granted - array of { topic, qos }
    function onSubscribe(err, granted) {
      console.log('Subscribed to', granted, '...')
      mqtt.on('message', onMessage)

      const filename =
        // @ts-ignore
        new Date().toISOString().replaceAll(':', '').slice(0, 17) + '.csv'
      const filepath = `${folder}/${filename}`
      console.log(`Recording MQTT messages to '${filepath}'...`)
      try {
        fd = fs.openSync(filepath, 'w')
      } catch (error) {
        console.log(`Problem opening file - does the directory exist?`)
        process.exit(1)
      }
      let time_last = Number(new Date())

      function onMessage(topic, buffer) {
        const message = buffer.toString()
        console.log('Message received:', topic, message.slice(0, 60))
        const msg = message.replaceAll('"', '""')
        const qos = 0
        const retain = true
        const time_now = Number(new Date())
        const time_delta = (time_now - time_last) / 1000 // seconds
        time_last = time_now
        const row = `${topic},"${msg}",${qos},${retain},${time_now},${time_delta}\n`
        //. write each msg, or write to array and flush every n msgs?
        fs.writeSync(fd, row)
      }
    }
    do {
      console.log(`Listening...`)
      //. break out on SIGINT or SIGTERM ?
      await sleep(2000)
    } while (true)
    fs.closeSync(fd)
  }

  console.log(`Closing MQTT connection...`)
  mqtt.end()
})

// sleep ms milliseconds
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
