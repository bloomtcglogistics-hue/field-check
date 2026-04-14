import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // When a new service worker is installed, tell it to skip waiting so
      // the fresh shell activates without a manual app close/reopen.
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[SW] New version installed — activating')
            worker.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })
    }).catch(console.error)

    // Reload once when the new worker takes control so the page picks up the
    // new bundle. The guard prevents reload loops in Chrome DevTools.
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return
      reloaded = true
      console.log('[SW] Controller changed — reloading')
      window.location.reload()
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
