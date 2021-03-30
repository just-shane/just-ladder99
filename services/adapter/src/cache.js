const calcs = [{}]

export class Cache {
  constructor() {
    this._map = new Map()
  }
  // addCalcs(calcs) {
  //   for (const calc of calcs) {
  //     console.log({ calc })
  //   }
  // }
  set(key, value) {
    this._map.set(key, value)
    //. call the shdr update fn to update dependent shdr values
    // updateShdr(key)
  }
  get(key) {
    return this._map.get(key)
  }
}

// connection:
// category: EVENT
// type: AVAILABILITY
// # value: types.AVAILABILITY[cache.get('${deviceId}-status-connection')]
// value: types.AVAILABILITY[<status-connection>]

const calcs = [{}]

// // get all shdr outputs for the cache values
// function getOutput(cache) {
//   const output = []
//   for (const calc of calcs) {
//     const timestamp = new Date().toISOString()
//     const key = calc.key
//     const value = calc.value(cache) // do calculation
//     const shdr = `${timestamp}|${key}|${value}`
//     console.log(shdr)
//     output.push(shdr)
//   }
//   return output.join('\n') + '\n'
// }
