// cache
// manage a set of key-item pairs.
// where key is a string, and item is an object with { value, timestamp, shdr, ... }.

// this is an intermediary between the raw device data and the shdr output.

// when a key-item value is set, the cache will perform any associated output
// calculations and send shdr output to attached tcp socket, IF the value changed.

// see setupSource.js and helpers.js for code that sets up the reactive cache calculations.
//. bring relevant code in here

export class Cache {
  //
  constructor() {
    // key-item pairs
    this.map = {}

    // list of outputs associated with each key
    // eg { 'm1-power_fault': [{ key:'m1-power_condition', value: (fn), ...}], ... }
    this.mapKeyToOutputs = {}
  }

  // addOutputs
  // each cache key can have multiple output calculations associated with it.
  // this builds a map from a key to a list of outputs.
  // each output goes to the same tcp socket.
  // called for each device source.
  // outputs is [{ key, category, type, representation, socket, dependsOn, value }, ...]
  // eg [{ key: 'ac1-power_condition', value: (fn), dependsOn: ['ac1-power_fault', 'ac1-power_warning'] }, ...]
  // so this builds a map from those dependsOn values to the output object.
  // eg { 'ac1-power_fault': [{ key:'ac1-power_condition', value: (fn), ...}], ... }
  addOutputs(outputs) {
    if (outputs) {
      const outputKeys = outputs.map(o => o.key).join(',') // just for logging
      console.log(`Cache addOutputs`, outputKeys)
      for (const output of outputs) {
        // add dependsOn eg ['ac1-power_fault', 'ac1-power_warning']
        for (const key of output.dependsOn) {
          //. test change
          // if (this.mapKeyToOutputs[key]) {
          //   this.mapKeyToOutputs[key].push(output)
          // } else {
          //   this.mapKeyToOutputs[key] = [output]
          // }
          this.mapKeyToOutputs[key] = this.mapKeyToOutputs[key] || []
          this.mapKeyToOutputs[key].push(output)
        }
      }
    }
  }

  // attach tcp socket to each output, or clear if socket=null
  setSocket(outputs, socket) {
    // can ignore if no outputs
    if (outputs) {
      const outputKeys = outputs.map(o => o.key).join(',')
      console.log(`Cache setSocket`, outputKeys)
      if (socket) {
        console.log(`Cache send last known data values to agent...`)
      }
      for (const output of outputs || []) {
        output.socket = socket
        if (output.socket) {
          // send last known data value to agent

          // //. send unavailable if no value saved yet?
          // // const shdr = getShdr(output, output.lastValue || 'UNAVAILABLE')
          // const shdr = getShdr(output, output.lastValue ?? 'UNAVAILABLE')
          // console.log(`Cache send "${truncate(shdr)}"`)
          // try {
          //   output.socket.write(shdr + '\n')
          // } catch (error) {
          //   console.log(error)
          // }

          //. only send shdr if lastValue exists?
          // i think this makes more sense.
          // next time the value is updated, it'll send the shdr.
          if (output.lastValue !== undefined) {
            const shdr = getShdr(output, output.lastValue)
            console.log(`Cache send "${truncate(shdr)}"`)
            try {
              output.socket.write(shdr + '\n')
            } catch (error) {
              console.log(error)
            }
          }
        }
      }
    }
  }

  // set a key-value pair in the cache.
  // eg set('ac1-power_warning', { quiet: true})
  // options is { timestamp, quiet }
  // timestamp is an optional STRING that is used in the SHDR
  //. explain distinction between value param and value variable below, with examples
  //. instead of fixed code here for output, could have custom code -
  // set other cache values, send partcount reset commands, etc.
  // ie you could attach multiple handlers to a cache key.
  set(key, value, options = {}) {
    // if (!options.quiet) {
    // const s = typeof value === 'string' ? `"${value.slice(0, 99)}..."` : value
    // console.log(`Cache - set ${key}: ${s}`)
    // }

    // //. don't allow undefined as a value? not in vocabulary of mtc. translate to UNAVAILABLE?
    // if (value === undefined) return

    //. what if want to check if a value changed?
    //. eg if (this.map[key] !== value) { ... }

    // update the cache value
    // this.map.set(key, value)
    this.map[key] = value

    // get list of outputs associated with this key, eg ['ac1-power_condition']
    const outputs = this.mapKeyToOutputs[key]
    if (outputs && outputs.length > 0) {
      // calculate outputs and send changed shdr values to tcp
      for (const output of outputs) {
        // calculate value of this cache output
        //. confusing to have two 'value' variables!
        const value = getValue(this, output)
        // if value changed, send shdr to agent via tcp socket
        if (value !== output.lastValue) {
          output.lastValue = value
          if (output.socket) {
            const shdr = getShdr(output, value, options.timestamp) // timestamp can be ''
            if (!options.quiet) {
              console.log(`Cache value changed, send "${truncate(shdr)}"`)
            }
            try {
              output.socket.write(shdr + '\n')
            } catch (error) {
              console.log(error)
            }
          } else {
            console.log(
              `Cache value changed, but no socket to write to yet - saved for later.`
            )
          }
        }
      }
    } else {
      console.log(`Cache warning no outputs for key ${key}`)
    }
  }

  // get a value from cache
  // eg get('pr1-avail')
  get(key) {
    // return this.map.get(key)
    return this.map[key]
  }

  // check if cache has a key
  has(key) {
    // return this.map.has(key)
    return this.map[key] !== undefined
  }

  // check if key has a shdr output associated with it
  hasOutput(key) {
    return this.mapKeyToOutputs[key] !== undefined
  }
}

// calculate value for the given cache output (can use other cache keyvalues)
function getValue(cache, output) {
  //. rename output.value to .getValue or .valueFn
  const { value: valueFn } = output
  const value = valueFn(cache) // do calculation
  return value
}

// calculate SHDR using the given output object.
// cache is the Cache object.
// output has { key, category, type, representation, value, shdr, ... }.
// timestamp is an optional ISO datetime STRING that goes at the front of the shdr.
// can save some time/space by not including it.
// eg SHDR could be '|m1-avail|AVAILABLE'
//. bring in DATA_SET handler and sanitizer from drivers/micro.js
function getShdr(output, value, timestamp = '') {
  if (typeof value === 'string') {
    value = sanitize(value)
  }
  const { key, category, type, subType, representation, nativeCode } = output
  let shdr = ''
  // handle different shdr types and representations
  // this first is the default representation, so don't require category to be defined in outputs.yaml
  if (category === 'EVENT' || category === 'SAMPLE' || category === undefined) {
    if (type === 'MESSAGE') {
      // The next special format is the Message. There is one additional field,
      // native_code, which needs to be included:
      // 2014-09-29T23:59:33.460470Z|message|CHG_INSRT|Change Inserts
      // From https://github.com/mtconnect/cppagent#adapter-agent-protocol-version-17 -
      shdr = `${timestamp}|${key}|${sanitize(nativeCode)}|${value}`
    } else {
      shdr = `${timestamp}|${key}|${value}`
    }
  } else if (category === 'CONDITION') {
    //. can have >1 value for a condition - how handle?
    //. see https://github.com/Ladder99/ladder99-ce/issues/130
    if (!value || value === 'UNAVAILABLE') {
      shdr = `${timestamp}|${key}|${value}||||${value}`
    } else {
      //. pick these values out of the value, which should be an object
      //. and sanitize them
      const level = value // eg 'WARNING' -> element 'Warning'
      const nativeCode = 'nativeCode'
      const nativeSeverity = 'nativeSeverity'
      const qualifier = 'qualifier'
      const message = value
      shdr = `${timestamp}|${key}|${level}|${nativeCode}|${nativeSeverity}|${qualifier}|${message}`
    }
  } else {
    console.warn(`Cache warning: unknown category '${category}'`)
  }
  return shdr
}

// helpers

// sanitize a string by escaping or removing pipes.
// from cppagent readme -
//   If the value itself contains a pipe character | the pipe must be escaped using a
//   leading backslash \. In addition the entire value has to be wrapped in quotes:
//   2009-06-15T00:00:00.000000|description|"Text with \| (pipe) character."
function sanitize(str) {
  return str.replaceAll('|', '/') //. just convert pipes to a slash for now
}

// truncate a string to some length, adding ellipsis if truncated
//. to lib
function truncate(str, len = 60) {
  return str.length > len ? str.slice(0, len) + '...' : str
}
