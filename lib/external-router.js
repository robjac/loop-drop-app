var ObservVarhash = require('observ-varhash')
var nextTick = require('next-tick')
var watchThrottle = require('throttle-observ/watch')

module.exports = ExternalRouter

function ExternalRouter (context, defaultValue, volume) {
  var obs = ObservVarhash()
  obs.context = context

  var externalConnections = []
  var refreshing = false

  var connections = {}
  var gains = {}

  var set = obs.set
  obs.set = function (v) {
    set(v == null ? defaultValue : v)
  }

  if (typeof volume === 'function') {
    volume(function (value) {
      Object.keys(gains).forEach(function (key) {
        gains[key].gain.value = value
      })
    })
  }

  obs(obs.refresh)

  obs.refresh = function () {
    if (!refreshing) {
      refreshing = true
      nextTick(refresh)
    }
  }

  var releaseWatcher = context.chunkLookup ? watchThrottle(context.chunkLookup, 500, obs.refresh) : null

  obs.destroy = function(){
    Object.keys(gains).forEach(function (key) {
      gains[key].disconnect()
      delete gains[key]
    })
    releaseWatcher && releaseWatcher()
    releaseWatcher = null
    // destroy all the child nodes
  }

  return obs

  // scoped

  function refresh () {
    refreshing = false
    var routes = obs() || {}
    Object.keys(routes).forEach(function (from) {
      var target = routes[from]
      var source = context.slotLookup.get(from)

      if (typeof target === 'string'){
        target = [target]
      }

      if (source && Array.isArray(target)){
        var routed = false

        if (!gains[from]) {
          gains[from] = context.audio.createGain()
          gains[from].gain.value = volume && volume() || 1
          source.connect(gains[from])
        }

        if (!connections[from]) {
          connections[from] = []
        }

        var destinations = target.map(function (to) {
          if (to && typeof to === 'string') {
            if (to === '$default') {
              return context.output
            } else {
              to = to.split('#')
              var destinationChunk = context.chunkLookup.get(to[0])
              var destinationSlot = destinationChunk && destinationChunk.getSlot(to[1])
              if (destinationSlot && destinationSlot.input) {
                return destinationSlot.input
              }
            }
          }
        }).filter(present)

        destinations.forEach(function (output) {
          if (!~connections[from].indexOf(output)) {
            gains[from].connect(output)
            connections[from].push(output)
          }
        })

        connections[from] = connections[from].filter(function (output) {
          if (!~destinations.indexOf(output)) {
            gains[from].disconnect(output)
            return false
          } else {
            return true
          }
        })
      }
    })

    Object.keys(gains).forEach(function (key) {
      if (!routes[key]) {
        gains[key].disconnect()
        delete gains[key]
      }
    })
  }
}

function present (value) {
  return value
}
