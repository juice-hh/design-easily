/**
 * Design Easily — Server entry point.
 * Delegates to app factory and starts listening.
 */

import { config } from './config.js'
import createApp from './app.js'

const { httpServer } = createApp()

httpServer.listen(config.port, '127.0.0.1', () => {
  console.log(`
╭─────────────────────────────────────────╮
│  Design Easily Server                   │
│  http://127.0.0.1:${config.port}                  │
│                                         │
│  Ctrl+C to stop                         │
╰─────────────────────────────────────────╯
`)
})
