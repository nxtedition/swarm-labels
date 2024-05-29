#!/usr/bin/env node
import { parseArgs } from 'node:util'
import Docker from 'dockerode'

const docker = new Docker()
const nodes = await docker.listNodes()

const { values: opts } = parseArgs({
  options: {
    'dry-run': {
      type: 'boolean',
      short: 'n',
    },
    primary: {
      type: 'string',
      short: 'p',
    },
    secondary: {
      type: 'string',
      short: 's',
    },
    static: {
      type: 'string',
      short: 'z',
    },
    log: {
      type: 'string',
      short: 'l',
    },
    extra: {
      type: 'string',
      short: 'e',
    },
  },
  allowPositionals: false,
  strict: true,
})

const n = nodes.map((x) => ({
  id: x.ID,
  name: x.Description.Hostname,
  labels: x.Spec.Labels,
  opts: {
    version: x.Version.Index,
    Role: x.Spec.Role,
    Availability: x.Spec.Availability,
  },
}))

let engines = n.filter((n) => /-srv/.test(n.name))
const supervisors = n.filter((n) => /-mgr/.test(n.name))
const ingests = n.filter((n) => /-ing/.test(n.name))
const playouts = n.filter((n) => /-gfx/.test(n.name))
let primary = opts.primary
  ? n.find((n) => n.name === opts.primary)
  : n.find((n) => /-srv1[a-z]?$/.test(n.name))
let secondary = opts.secondary
  ? n.find((n) => n.name === opts.secondary)
  : n.find((n) => /-srv2[a-z]?$/.test(n.name))

if (n.length === 1) {
  primary = secondary = n[0]
  engines = n
}

const ztatic = opts.static ? n.find((n) => n.name === opts.static) : primary
const log = opts.log ? n.find(n => n.name === opts.log) : secondary

const extra = (opts.extra ?? 'ollama').split(',')

for (const node of n) {
  const labels = [
    ...(engines.includes(node) ? ['engine', ...extra] : []),
    supervisors.includes(node) ? 'supervisor' : null,
    ingests.includes(node) ? 'ingest' : null,
    playouts.includes(node) ? 'playout' : null,
    node === primary ? 'primary' : null,
    node === secondary ? 'secondary' : null,
    node === ztatic ? 'static' : null,
    node === log ? 'log' : null,
  ].filter(Boolean)

  const add = labels.filter((label) => !node.labels[`com.nxt.class.${label}`])
  if (!add.length) {
    console.log(`${node.name}: ok (${labels.join(', ')})`)
    continue
  }

  const all = {
    ...Object.fromEntries(labels.map((label) => [`com.nxt.class.${label}`, 'true'])),
    ...node.labels,
  }

  if (!opts['dry-run']) {
    await docker.getNode(node.id).update({ ...node.opts, Labels: all })
    console.log(`${node.name}: added ${add.join(', ')}`)
  } else {
    console.log(`${node.name}: will add ${add.join(', ')}`)
  }
}
