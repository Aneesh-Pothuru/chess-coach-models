// Loaded by bridge/run.sh before an eval: see app-packages.mjs.
import { register } from 'node:module'

register('./app-packages.mjs', import.meta.url)
