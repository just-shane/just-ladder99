// translate devices.yaml to devices.xml

// note: we use 'yaml' and 'xml' for the strings,
// 'yamltree' and 'xmltree' for the corresponding js structures.

import fs from 'fs' // node lib filesys
import libyaml from 'js-yaml' // https://github.com/nodeca/js-yaml
import libxml from 'xml-js' // https://github.com/nashwaan/xml-js
import xmltree from './xmltree.js' // base xml structure
import sets from './sets.js' // vocabulary

const yamlfile = process.argv[2] // eg 'setups/demo/devices.yaml'
const xmlfile = process.argv[3] // eg 'setups/demo/volumes/agent/devices.xml'

// main
const devices = loadYamlTree(yamlfile).devices // array of objs
attachDevices(xmltree, devices)
saveXmlTree(xmltree, xmlfile)

/**
 * attach devices from devices.yaml to xml tree
 * @param {object} xmltree
 * @param {array} devices
 */
function attachDevices(xmltree, devices) {
  const xmldevices = []

  // iterate over device definitions
  for (const device of devices) {
    const { id, model, properties, sources } = device

    // // get array of outputs from output.yaml, which defines dataItems for model.
    // // each output is like -
    // //   { key: 'connection', category: 'EVENT', type: 'AVAILABILITY', value: ... }
    // const outputPath = `models/${model}/outputs.yaml`
    // const outputs = loadYamlTree(outputPath).outputs

    // get dataItems dict - maps from key to dataItem object.
    //. supposed to get dataItems from ALL sources, not the device model.
    // const dataItems = getDataItems(outputs, id)
    const dataItems = getDataItems(sources, id)

    // get model.yaml, making text substitutions with properties
    const transforms = getTransforms(properties, id)
    const modelPath = `models/${model}/model.yaml`
    const modelTree = loadYamlTree(modelPath, transforms).model

    // recurse down the model tree, replacing dataItems with their output defs.
    attachDataItems(modelTree, dataItems)

    // report any dataItems not used
    const unused = Object.values(dataItems).filter(item => !item.used)
    if (unused.length > 0) {
      const unusedStr = unused.map(item => "'" + item.id + "'").join(', ')
      console.log(`warning: unused dataItems ${unusedStr}`)
    }

    // convert model to xml and add to list
    const xmltree = translateYamlToXml(modelTree)
    xmldevices.push(xmltree)
  }

  // attach array of devices to tree
  xmltree.MTConnectDevices[0].Devices.Device = xmldevices
}

/**
 * get text transforms to substitute properties into a string.
 * eg '${deviceId}' => 'ccs-pa-001'
 */
function getTransforms(properties, id) {
  properties.deviceId = id
  const transforms = Object.keys(properties).map(key => {
    const value = properties[key]
    return str => str.replaceAll('${' + key + '}', value) // replaceAll needs node15
  })
  return transforms
}

/**
 * get map from keys to dataItems
 * @param {array} sources
 * @param {string} id
 * @returns {object} map from key to dataItem object
 */
//. if want this to get ALL dataitems incl 'operator', then need to pass it ALL
// models for the device, eh ?
// function getDataItems(outputs, id) {
function getDataItems(sources, id) {
  const dataItems = {}
  for (const source of sources) {
    const { model } = source
    // get array of outputs from output.yaml, which defines dataItems for model.
    // each output is like -
    //   { key: 'connection', category: 'EVENT', type: 'AVAILABILITY', value: ... }
    const outputPath = `models/${model}/outputs.yaml`
    const outputs = loadYamlTree(outputPath).outputs

    // iterate over outputs, getting dataItems for each, adding to map
    for (const output of outputs) {
      const key = output.key
      let dataItem = { ...output } // copy the dataItem
      dataItem.id = id + '-' + key
      if (!dataItem.type) {
        console.log(
          `warning: type not specified for output '${key}' - setting to UNKNOWN`
        )
        dataItem.type = 'UNKNOWN' // else agent dies
      }
      // remove unneeded props from the dataItem copy
      delete dataItem.key
      delete dataItem.value
      // save to map
      dataItems[key] = dataItem
    }
  }
  return dataItems
}

/**
 * attach dataItems from outputs.yaml to model.yaml tree recursively.
 * @param {object} node - the xml node to attach to
 * @param {object} dataItems - dict of dataItem objects
 */
function attachDataItems(node, dataItems) {
  // if node is an array, recurse down each element
  if (Array.isArray(node)) {
    for (const subnode of node) {
      attachDataItems(subnode, dataItems)
    }
    // else if node is an object, recurse down values
  } else if (node !== null && typeof node === 'object') {
    // iterate over dict values
    for (const key of Object.keys(node)) {
      // if dataItems, replace each element with its corresponding dataItem obj
      if (key === 'dataItems') {
        const keys = node.dataItems.dataItem
        for (let i = 0; i < keys.length; i++) {
          const dataItem = dataItems[keys[i]]
          if (dataItem) {
            keys[i] = dataItem
            dataItem.used = true
          } else {
            console.log(`warning: unknown dataItem '${keys[i]}' in model.yaml`)
            keys[i] = { id: keys[i], type: 'UNKNOWN', category: 'UNKNOWN' }
          }
        }
      } else {
        const subnode = node[key]
        attachDataItems(subnode, dataItems)
      }
    }
  }
}

/**
 * translate yaml tree to xml tree recursively
 * @param {object} node - a yaml tree node
 * @returns xml tree
 */
function translateYamlToXml(node) {
  if (Array.isArray(node)) {
    return node.map(el => translateYamlToXml(el))
  } else if (node !== null && typeof node === 'object') {
    const obj = {}
    const attributes = {}
    const elements = {}
    for (const key of Object.keys(node)) {
      const el = node[key]
      if (sets.attributes.has(key)) {
        attributes[key] = el
      } else if (sets.values.has(key)) {
        obj._text = el
      } else if (sets.hidden.has(key)) {
        // ignore
      } else {
        const element = translateYamlToXml(el)
        elements[capitalize(key)] = element
      }
    }
    return { _attributes: attributes, ...elements, ...obj }
  } else {
    return null
  }
}

/**
 * capitalize a string
 */
function capitalize(str) {
  return str.slice(0, 1).toUpperCase() + str.slice(1)
}

/**
 * import a yaml file, apply any transforms, parse it,
 * and return as a js structure.
 * @param yamlfile {string}
 * @returns {object} yaml tree
 */
function loadYamlTree(yamlfile, transforms = []) {
  let yaml = fs.readFileSync(yamlfile, 'utf8')
  for (const transform of transforms) {
    yaml = transform(yaml)
  }
  const yamltree = libyaml.load(yaml) // parse yaml
  return yamltree
}

/**
 * convert xml structure to xml string and save to a file.
 * @param {object} xmltree
 * @param {string} xmlfile
 */
function saveXmlTree(xmltree, xmlfile) {
  const xml = libxml.js2xml(xmltree, { compact: true, spaces: 2 })
  fs.writeFileSync(xmlfile, xml)
}

/**
 * print an object with unlimited depth
 */
function dir(obj) {
  console.dir(obj, { depth: null })
}
